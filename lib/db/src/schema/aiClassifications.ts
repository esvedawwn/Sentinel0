import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

/**
 * One row per AI classification event for a finding. `findings.ai_*` columns
 * always hold a denormalized copy of the most recent row here (for fast
 * reads); this table is the durable, appendable history of every
 * classification attempt (useful for re-classification and auditing).
 */
export const aiClassificationsTable = sqliteTable(
  "ai_classifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    confidence: integer("confidence").notNull(),
    explanation: text("explanation").notNull().default(""),
    suggestedDestination: text("suggested_destination"),
    suggestedAction: text("suggested_action"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("ai_classifications_finding_id_idx").on(table.findingId),
    index("ai_classifications_category_idx").on(table.category),
  ]
);

export const insertAIClassificationSchema = createInsertSchema(aiClassificationsTable).omit({ id: true });
export type InsertAIClassification = z.infer<typeof insertAIClassificationSchema>;
export type AIClassification = typeof aiClassificationsTable.$inferSelect;
