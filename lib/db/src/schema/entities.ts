import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

export type EntityType =
  | "person"
  | "organization"
  | "date"
  | "invoice_number"
  | "case_reference"
  | "amount";

/**
 * Structured entities pulled out of extracted document text (heuristic
 * extraction — see `extraction/entityExtractor.ts`). Many rows per finding.
 */
export const entitiesTable = sqliteTable(
  "entities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    type: text("type").$type<EntityType>().notNull(),
    value: text("value").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("entities_finding_id_idx").on(table.findingId),
    index("entities_type_idx").on(table.type),
  ]
);

export const insertEntitySchema = createInsertSchema(entitiesTable, {
  type: z.enum(["person", "organization", "date", "invoice_number", "case_reference", "amount"]),
}).omit({ id: true });
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entitiesTable.$inferSelect;
