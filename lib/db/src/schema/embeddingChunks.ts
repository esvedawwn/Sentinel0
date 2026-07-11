import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { extractedTextTable } from "./extractedText";
import { findingsTable } from "./findings";

/**
 * Text chunks with their embedding vectors. Each `extractedText` row can
 * produce one or many chunks (paragraph-aware splitting, max 512 chars per
 * chunk). Vectors are stored as raw Float32 BLOB — no external vector DB
 * required. Cosine similarity is computed in JS at query time.
 *
 * Deletion: delete by findingId (cascades from findings) or
 * extractedTextId. No embeddings are ever created automatically — only
 * when the user explicitly triggers embedding for a specific finding.
 *
 * Protection: embedding vectors are derived features, not raw content.
 * The original text is in `extractedText.text`; embedding chunks only
 * store the chunk text excerpt and its vector. Both are gated behind
 * `userSettings.embeddingsEnabled`.
 */
export type EmbeddingModel = "local-hash-v1" | "openai-text-embedding-ada-002" | "openai-text-embedding-3-small";

export const embeddingChunksTable = sqliteTable(
  "embedding_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    extractedTextId: integer("extracted_text_id")
      .notNull()
      .references(() => extractedTextTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull().default(0),
    chunkText: text("chunk_text").notNull(),
    /** Raw little-endian Float32Array bytes. dimensionality = byteLength / 4 */
    vector: blob("vector", { mode: "buffer" }).notNull(),
    model: text("model").$type<EmbeddingModel>().notNull().default("local-hash-v1"),
    dimensionality: integer("dimensionality").notNull().default(128),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("embedding_chunks_finding_id_idx").on(table.findingId),
    index("embedding_chunks_extracted_text_id_idx").on(table.extractedTextId),
    index("embedding_chunks_model_idx").on(table.model),
  ]
);

export const insertEmbeddingChunkSchema = createInsertSchema(embeddingChunksTable, {
  model: z.enum(["local-hash-v1", "openai-text-embedding-ada-002", "openai-text-embedding-3-small"]),
}).omit({ id: true });

export type InsertEmbeddingChunk = z.infer<typeof insertEmbeddingChunkSchema>;
export type EmbeddingChunk = typeof embeddingChunksTable.$inferSelect;
