import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

/**
 * Normalized, queryable copy of the semantic tags the AI classifier attaches
 * to a finding (`findings.ai_tags` keeps the denormalized JSON array for
 * fast display). One row per (finding, tag).
 */
export const semanticTagsTable = sqliteTable(
  "semantic_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("semantic_tags_finding_id_idx").on(table.findingId),
    index("semantic_tags_tag_idx").on(table.tag),
    unique("semantic_tags_finding_tag_unique").on(table.findingId, table.tag),
  ]
);

export const insertSemanticTagSchema = createInsertSchema(semanticTagsTable).omit({ id: true });
export type InsertSemanticTag = z.infer<typeof insertSemanticTagSchema>;
export type SemanticTag = typeof semanticTagsTable.$inferSelect;
