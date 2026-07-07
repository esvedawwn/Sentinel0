import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scansTable } from "./scans";

export const findingTypeEnum = pgEnum("finding_type", [
  "empty_folder",
  "zero_byte",
  "idlk_file",
  "locked_file",
  "installer",
  "archive",
  "large_file",
  "duplicate",
]);

export const findingStatusEnum = pgEnum("finding_status", [
  "safe_delete",
  "review",
  "duplicate",
  "ignored",
]);

export const findingsTable = pgTable("findings", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  type: findingTypeEnum("type").notNull(),
  path: text("path").notNull(),
  name: text("name").notNull(),
  extension: text("extension").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  hash: text("hash"),
  duplicateGroupHash: text("duplicate_group_hash"),
  findingStatus: findingStatusEnum("finding_status").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFindingSchema = createInsertSchema(findingsTable).omit({ id: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;
