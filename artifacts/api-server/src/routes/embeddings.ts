import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  embedFinding,
  deleteEmbeddings,
  rebuildIndex,
  getIndexStats,
  semanticSearch,
} from "../embeddings/embeddingService.js";
import { runSearch } from "../search/searchService.js";

const router: IRouter = Router();

// ── Semantic search ──────────────────────────────────────────────────────────

const SemanticSearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  minScore: z.coerce.number().min(0).max(1).optional().default(0.05),
  hybrid: z.coerce.boolean().optional().default(true),
});

router.get("/search/semantic", async (req, res): Promise<void> => {
  const parsed = SemanticSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { q, limit, minScore, hybrid } = parsed.data;

  // Run semantic search
  const semanticHits = await semanticSearch(q, { limit, minScore });

  let lexicalFindings: Awaited<ReturnType<typeof runSearch>>["findings"] = [];
  if (hybrid) {
    // Also run lexical search for hybrid blending
    const lexical = await runSearch({ q, limit });
    lexicalFindings = lexical.findings;
  }

  // Score map for lexical results (rank-based)
  const lexicalScoreMap = new Map<number, number>();
  lexicalFindings.forEach((f, idx) => {
    lexicalScoreMap.set(f.id, 1 - idx / Math.max(lexicalFindings.length, 1));
  });

  // Merge: semantic hits get 0.7 weight, lexical gets 0.3 weight
  const combinedMap = new Map<number, {
    findingId: number;
    semanticScore: number;
    lexicalScore: number;
    combinedScore: number;
    chunkText: string | null;
    model: string | null;
  }>();

  for (const hit of semanticHits) {
    const lexScore = lexicalScoreMap.get(hit.findingId) ?? 0;
    combinedMap.set(hit.findingId, {
      findingId: hit.findingId,
      semanticScore: hit.score,
      lexicalScore: lexScore,
      combinedScore: hybrid ? hit.score * 0.7 + lexScore * 0.3 : hit.score,
      chunkText: hit.chunkText,
      model: hit.model,
    });
  }

  // Include lexical-only hits if hybrid
  if (hybrid) {
    for (const f of lexicalFindings) {
      if (!combinedMap.has(f.id)) {
        combinedMap.set(f.id, {
          findingId: f.id,
          semanticScore: 0,
          lexicalScore: lexicalScoreMap.get(f.id) ?? 0,
          combinedScore: (lexicalScoreMap.get(f.id) ?? 0) * 0.3,
          chunkText: null,
          model: null,
        });
      }
    }
  }

  const sorted = [...combinedMap.values()].sort((a, b) => b.combinedScore - a.combinedScore).slice(0, limit);

  res.json({
    query: q,
    hybrid,
    semanticAvailable: semanticHits.length > 0,
    results: sorted.map((r) => ({
      findingId: r.findingId,
      semanticScore: parseFloat(r.semanticScore.toFixed(4)),
      lexicalScore: parseFloat(r.lexicalScore.toFixed(4)),
      combinedScore: parseFloat(r.combinedScore.toFixed(4)),
      matchedPassage: r.chunkText ?? null,
      model: r.model ?? null,
    })),
  });
});

// ── Index stats ───────────────────────────────────────────────────────────────

router.get("/search/index/stats", async (_req, res): Promise<void> => {
  const stats = await getIndexStats();
  res.json(stats);
});

// ── Rebuild index ─────────────────────────────────────────────────────────────

router.post("/search/index/rebuild", async (_req, res): Promise<void> => {
  try {
    const result = await rebuildIndex();
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Rebuild failed" });
  }
});

// ── Embed a single finding ────────────────────────────────────────────────────

router.post("/search/index/embedding/:findingId", async (req, res): Promise<void> => {
  const findingId = parseInt(req.params.findingId, 10);
  if (isNaN(findingId)) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }
  try {
    const result = await embedFinding(findingId);
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Embedding failed" });
  }
});

// ── Delete embeddings for a finding ──────────────────────────────────────────

router.delete("/search/index/embedding/:findingId", async (req, res): Promise<void> => {
  const findingId = parseInt(req.params.findingId, 10);
  if (isNaN(findingId)) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }
  const removed = await deleteEmbeddings(findingId);
  res.json({ findingId, chunksRemoved: removed });
});

export default router;
