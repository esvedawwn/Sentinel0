import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scansTable } from "./scans";

export type FindingType =
  | "empty_folder"
  | "zero_byte"
  | "idlk_file"
  | "locked_file"
  | "installer"
  | "archive"
  | "large_file"
  | "duplicate";

export type FindingStatus = "safe_delete" | "review" | "duplicate" | "ignored";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export const findingsTable = sqliteTable(
  "findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scansTable.id, { onDelete: "cascade" }),
    type: text("type").$type<FindingType>().notNull(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    extension: text("extension").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    hash: text("hash"),
    duplicateGroupHash: text("duplicate_group_hash"),
    duplicateGroupId: integer("duplicate_group_id"),
    findingStatus: text("finding_status").$type<FindingStatus>().notNull(),
    riskLevel: text("risk_level").$type<RiskLevel>().notNull().default("low"),
    reason: text("reason").notNull().default(""),
    // Filesystem timestamps captured at scan time (distinct from createdAt, which is when the row was inserted)
    fileCreatedAt: integer("file_created_at", { mode: "timestamp" }),
    fileModifiedAt: integer("file_modified_at", { mode: "timestamp" }),
    // AI classification fields (denormalized copy of the latest row in ai_classifications, for fast reads)
    aiCategory: text("ai_category"),
    aiSubcategory: text("ai_subcategory"),
    aiConfidence: integer("ai_confidence"),
    aiExplanation: text("ai_explanation"),
    aiTags: text("ai_tags", { mode: "json" }).$type<string[]>(),
    aiSuggestedDestination: text("ai_suggested_destination"),
    aiSuggestedAction: text("ai_suggested_action"),
    aiProvider: text("ai_provider"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("findings_path_idx").on(table.path),
    index("findings_name_idx").on(table.name),
    index("findings_extension_idx").on(table.extension),
    index("findings_ai_category_idx").on(table.aiCategory),
    index("findings_file_modified_at_idx").on(table.fileModifiedAt),
    index("findings_hash_idx").on(table.hash),
    index("findings_scan_id_idx").on(table.scanId),
    index("findings_duplicate_group_id_idx").on(table.duplicateGroupId),
  ]
);

export const insertFindingSchema = createInsertSchema(findingsTable, {
  type: z.enum([
    "empty_folder",
    "zero_byte",
    "idlk_file",
    "locked_file",
    "installer",
    "archive",
    "large_file",
    "duplicate",
  ]),
  findingStatus: z.enum(["safe_delete", "review", "duplicate", "ignored"]),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  aiTags: z.array(z.string()).optional(),
}).omit({ id: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;
