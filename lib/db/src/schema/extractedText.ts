import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

export type ExtractorKind = "pdf" | "txt" | "csv" | "json" | "markdown" | "source_code" | "ocr";
export type SensitiveCategory =
  | "legal"
  | "banking"
  | "medical"
  | "identity"
  | "api_key"
  | "password"
  | "private_key";

/**
 * Extracted document text, stored separately from `findings` metadata so
 * file content never leaks into the lightweight metadata rows/exports.
 * One row per extraction attempt (append-only, like `aiClassifications`).
 */
export const extractedTextTable = sqliteTable(
  "extracted_text",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    extractor: text("extractor").$type<ExtractorKind>().notNull(),
    text: text("text").notNull().default(""),
    truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
    sensitiveCategories: text("sensitive_categories", { mode: "json" }).$type<SensitiveCategory[]>().notNull().default([]),
    ocrProvider: text("ocr_provider"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("extracted_text_finding_id_idx").on(table.findingId),
    index("extracted_text_created_at_idx").on(table.createdAt),
  ]
);

export const insertExtractedTextSchema = createInsertSchema(extractedTextTable, {
  extractor: z.enum(["pdf", "txt", "csv", "json", "markdown", "source_code", "ocr"]),
  sensitiveCategories: z.array(
    z.enum(["legal", "banking", "medical", "identity", "api_key", "password", "private_key"])
  ),
}).omit({ id: true });
export type InsertExtractedText = z.infer<typeof insertExtractedTextSchema>;
export type ExtractedText = typeof extractedTextTable.$inferSelect;
