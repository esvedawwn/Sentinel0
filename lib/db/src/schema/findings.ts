import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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

export const findingsTable = sqliteTable("findings", {
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
  findingStatus: text("finding_status").$type<FindingStatus>().notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

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
}).omit({ id: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;
