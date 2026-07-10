import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

/**
 * Durable, auditable record of findings a user has explicitly dismissed.
 * Ignoring a finding never deletes it — the underlying finding row (and its
 * scan history) is preserved; this table only tracks the ignore decision.
 */
export const ignoredFindingsTable = sqliteTable(
  "ignored_findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .unique()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    reason: text("reason"),
    ignoredAt: integer("ignored_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("ignored_findings_finding_id_idx").on(table.findingId)]
);

export const insertIgnoredFindingSchema = createInsertSchema(ignoredFindingsTable).omit({ id: true });
export type InsertIgnoredFinding = z.infer<typeof insertIgnoredFindingSchema>;
export type IgnoredFinding = typeof ignoredFindingsTable.$inferSelect;
