/**
 * Embedding service — the single entry point for all embedding operations.
 *
 * PRIVACY ENFORCEMENT (not just documentation):
 *  - All embed calls check userSettings.embeddingsEnabled before proceeding.
 *  - Cloud provider is only built when cloudConsent=true AND EMBEDDINGS_API_KEY is set.
 *  - If embeddingsEnabled is false, the service returns an error immediately — no
 *    vectors are generated, no chunks are stored.
 *
 * STORAGE:
 *  - Vectors are stored as raw little-endian Float32 BLOBs in `embedding_chunks`.
 *  - Each chunk row also stores the chunk text excerpt so retrieval can return
 *    matched passages without re-reading the original extracted text.
 *  - One extractedText row → N chunk rows (one per paragraph/sentence block).
 *
 * DELETION:
 *  - `deleteEmbeddings(findingId)` removes all chunk rows for a finding.
 *  - Schema has ON DELETE CASCADE from findings → embedding_chunks, so a finding
 *    deletion also removes its embeddings automatically.
 *  - There is no automatic background re-indexing — users rebuild via the API.
 *
 * PROTECTION:
 *  - Embedding vectors are derived features — they encode statistical patterns,
 *    not verbatim content. Reverting a vector to its source text is computationally
 *    infeasible with the local-hash model.
 *  - Cloud embeddings (OpenAI) are produced by a third party — see AI_PRIVACY.md
 *    for the consent model.
 */

import { eq, sql, and } from "drizzle-orm";
import {
  db,
  embeddingChunksTable,
  extractedTextTable,
  userSettingsTable,
  findingsTable,
  type EmbeddingChunk,
  type EmbeddingModel,
} from "@workspace/db";
import { chunkText, type TextChunk } from "./chunker.js";
import { buildEmbeddingsProvider, cosineSimilarity, type EmbeddingsProvider, type EmbeddingVector } from "./providers.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface SemanticHit {
  findingId: number;
  chunkId: number;
  chunkText: string;
  score: number;       // cosine similarity 0–1
  model: EmbeddingModel;
}

export interface IndexStats {
  totalChunks: number;
  embeddedFindings: number;
  model: string;
  embeddingsEnabled: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Settings helper
// ────────────────────────────────────────────────────────────────────────────

async function getSettings() {
  const rows = await db.select().from(userSettingsTable).limit(1);
  return rows[0] ?? { embeddingsEnabled: false, localOnlyProcessing: true, cloudConsent: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Store embeddings for a finding
// ────────────────────────────────────────────────────────────────────────────

/**
 * Embed all extracted-text chunks for a specific finding and persist them.
 * Returns the number of chunks stored, or throws if embeddings are disabled.
 */
export async function embedFinding(findingId: number): Promise<{ chunksStored: number; model: EmbeddingModel }> {
  const settings = await getSettings();
  if (!settings.embeddingsEnabled) {
    throw new Error("Embeddings are disabled. Enable them in Settings before indexing.");
  }

  const provider = buildEmbeddingsProvider({
    cloudConsent: settings.cloudConsent,
    localOnly: settings.localOnlyProcessing,
  });

  // Get the most recent extracted text for this finding
  const [extracted] = await db
    .select()
    .from(extractedTextTable)
    .where(eq(extractedTextTable.findingId, findingId))
    .orderBy(extractedTextTable.createdAt)
    .limit(1);

  if (!extracted || !extracted.text.trim()) {
    throw new Error(`No extracted text found for finding ${findingId}. Extract the document first.`);
  }

  const chunks: TextChunk[] = chunkText(extracted.text);
  if (chunks.length === 0) {
    throw new Error(`No embeddable chunks produced from finding ${findingId} — text may be empty.`);
  }

  const vectors = await provider.embedBatch(chunks.map((c) => c.text));

  // Delete any existing embeddings for this finding (rebuild in place)
  await db.delete(embeddingChunksTable).where(eq(embeddingChunksTable.findingId, findingId));

  // Insert new chunks
  const model = provider.model as EmbeddingModel;
  for (let i = 0; i < chunks.length; i++) {
    const buf = Buffer.from(vectors[i].buffer, vectors[i].byteOffset, vectors[i].byteLength);
    await db.insert(embeddingChunksTable).values({
      findingId,
      extractedTextId: extracted.id,
      chunkIndex: chunks[i].index,
      chunkText: chunks[i].text,
      vector: buf,
      model,
      dimensionality: provider.dimensionality,
    });
  }

  return { chunksStored: chunks.length, model };
}

// ────────────────────────────────────────────────────────────────────────────
// Delete embeddings
// ────────────────────────────────────────────────────────────────────────────

export async function deleteEmbeddings(findingId: number): Promise<number> {
  const result = await db
    .delete(embeddingChunksTable)
    .where(eq(embeddingChunksTable.findingId, findingId));
  return (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Rebuild the full index
// ────────────────────────────────────────────────────────────────────────────

/**
 * Re-embed all findings that have extracted text. Existing chunks are
 * replaced. Returns how many findings were indexed.
 */
export async function rebuildIndex(): Promise<{ indexed: number; skipped: number; model: EmbeddingModel }> {
  const settings = await getSettings();
  if (!settings.embeddingsEnabled) {
    throw new Error("Embeddings are disabled. Enable them in Settings before rebuilding the index.");
  }

  const provider = buildEmbeddingsProvider({
    cloudConsent: settings.cloudConsent,
    localOnly: settings.localOnlyProcessing,
  });

  // Get all findings that have at least one extracted text row
  const extractedRows = await db
    .select({ findingId: extractedTextTable.findingId })
    .from(extractedTextTable)
    .groupBy(extractedTextTable.findingId);

  let indexed = 0;
  let skipped = 0;
  const model = provider.model as EmbeddingModel;

  for (const { findingId } of extractedRows) {
    try {
      await embedFinding(findingId);
      indexed++;
    } catch {
      skipped++;
    }
  }

  return { indexed, skipped, model };
}

// ────────────────────────────────────────────────────────────────────────────
// Semantic search
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run a semantic search query. Embeds the query with the same local provider,
 * then computes cosine similarity against all stored chunk vectors.
 * Returns hits sorted by descending score, capped at `limit`.
 *
 * If embeddingsEnabled is false, returns an empty result set (not an error)
 * so the calling hybrid-search can still fall back to lexical results.
 */
export async function semanticSearch(
  query: string,
  opts: { limit?: number; minScore?: number } = {}
): Promise<SemanticHit[]> {
  const { limit = 20, minScore = 0.05 } = opts;

  const settings = await getSettings();
  if (!settings.embeddingsEnabled) return [];

  const provider = buildEmbeddingsProvider({
    cloudConsent: settings.cloudConsent,
    localOnly: settings.localOnlyProcessing,
  });

  const queryVector = await provider.embed(query);

  // Load all chunks from DB
  const chunks = await db.select().from(embeddingChunksTable);
  if (chunks.length === 0) return [];

  const hits: SemanticHit[] = [];

  for (const chunk of chunks) {
    try {
      // Deserialize vector from BLOB
      const arr = new Float32Array(
        (chunk.vector as Buffer).buffer,
        (chunk.vector as Buffer).byteOffset,
        (chunk.vector as Buffer).byteLength / 4
      );

      // Only compare if dimensions match (guard against mixed models in index)
      if (arr.length !== queryVector.length) continue;

      const score = cosineSimilarity(queryVector, arr);
      if (score >= minScore) {
        hits.push({
          findingId: chunk.findingId,
          chunkId: chunk.id,
          chunkText: chunk.chunkText,
          score,
          model: chunk.model as EmbeddingModel,
        });
      }
    } catch {
      // Malformed chunk — skip
    }
  }

  // Deduplicate by findingId: keep only the best-scoring chunk per finding
  const byFinding = new Map<number, SemanticHit>();
  for (const hit of hits) {
    const existing = byFinding.get(hit.findingId);
    if (!existing || hit.score > existing.score) {
      byFinding.set(hit.findingId, hit);
    }
  }

  return [...byFinding.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ────────────────────────────────────────────────────────────────────────────
// Index stats
// ────────────────────────────────────────────────────────────────────────────

export async function getIndexStats(): Promise<IndexStats> {
  const settings = await getSettings();
  const [chunkCount, findingCount] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(embeddingChunksTable),
    db
      .select({ c: sql<number>`count(distinct ${embeddingChunksTable.findingId})` })
      .from(embeddingChunksTable),
  ]);

  return {
    totalChunks: Number(chunkCount[0]?.c ?? 0),
    embeddedFindings: Number(findingCount[0]?.c ?? 0),
    model: settings.localOnlyProcessing || !settings.cloudConsent ? "local-hash-v1" : "openai-text-embedding-3-small",
    embeddingsEnabled: settings.embeddingsEnabled,
  };
}
