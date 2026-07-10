import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { filesTable } from "./files";
import { scansTable } from "./scans";
import { findingsTable } from "./findings";

export type DuplicateStatus = "pending" | "resolved" | "ignored" | "false_positive";

export const duplicateGroupsTable = sqliteTable(
  "duplicate_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id").references(() => scansTable.id, { onDelete: "set null" }),
    hash: text("hash"),
    status: text("status").$type<DuplicateStatus>().notNull().default("pending"),
    totalSizeBytes: integer("total_size_bytes").notNull().default(0),
    savedBytes: integer("saved_bytes").notNull().default(0),
    // Confidence that group members are true duplicates (0-1). 1.0 for exact
    // cryptographic hash matches — this pipeline never produces anything less.
    confidence: real("confidence").notNull().default(1),
    // Human-readable explanation of why these files were grouped together.
    explanation: text("explanation").notNull().default(""),
    // User- (or heuristically-) selected "keep this one" candidate. Nullable
    // until a canonical file is chosen; choosing one is a preview-only action
    // and never deletes anything on its own.
    canonicalFindingId: integer("canonical_finding_id").references(() => findingsTable.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (table) => [index("duplicate_groups_scan_id_idx").on(table.scanId), index("duplicate_groups_hash_idx").on(table.hash)]
);

export const duplicateGroupFilesTable = sqliteTable("duplicate_group_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id")
    .notNull()
    .references(() => duplicateGroupsTable.id, { onDelete: "cascade" }),
  fileId: integer("file_id")
    .notNull()
    .references(() => filesTable.id, { onDelete: "cascade" }),
});

export const insertDuplicateGroupSchema = createInsertSchema(duplicateGroupsTable, {
  status: z.enum(["pending", "resolved", "ignored", "false_positive"]),
}).omit({ id: true });
export type InsertDuplicateGroup = z.infer<typeof insertDuplicateGroupSchema>;
export type DuplicateGroup = typeof duplicateGroupsTable.$inferSelect;
