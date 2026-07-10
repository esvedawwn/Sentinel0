import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

export type FindingAuditAction =
  | "mark_reviewed"
  | "accept_recommendation"
  | "reject_recommendation"
  | "ignore_once"
  | "ignore_permanently"
  | "create_rule";

/**
 * Append-only audit trail: one row per review decision made on a finding.
 * Never updated or deleted — this is the durable record of "who decided what,
 * when" for compliance/traceability. Distinct from `ignoredFindings`, which
 * is the current-state ignore flag.
 */
export const findingAuditTable = sqliteTable(
  "finding_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    action: text("action").$type<FindingAuditAction>().notNull(),
    previousReviewStatus: text("previous_review_status"),
    newReviewStatus: text("new_review_status").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("finding_audit_finding_id_idx").on(table.findingId),
    index("finding_audit_created_at_idx").on(table.createdAt),
  ]
);

export const insertFindingAuditSchema = createInsertSchema(findingAuditTable, {
  action: z.enum([
    "mark_reviewed",
    "accept_recommendation",
    "reject_recommendation",
    "ignore_once",
    "ignore_permanently",
    "create_rule",
  ]),
}).omit({ id: true });
export type InsertFindingAudit = z.infer<typeof insertFindingAuditSchema>;
export type FindingAudit = typeof findingAuditTable.$inferSelect;
