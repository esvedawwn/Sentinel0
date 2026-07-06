import { pgTable, serial, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { filesTable } from "./files";

export const duplicateStatusEnum = pgEnum("duplicate_status", [
  "pending",
  "resolved",
  "ignored",
]);

export const duplicateGroupsTable = pgTable("duplicate_groups", {
  id: serial("id").primaryKey(),
  status: duplicateStatusEnum("status").notNull().default("pending"),
  totalSizeBytes: integer("total_size_bytes").notNull().default(0),
  savedBytes: integer("saved_bytes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const duplicateGroupFilesTable = pgTable("duplicate_group_files", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => duplicateGroupsTable.id, { onDelete: "cascade" }),
  fileId: integer("file_id").notNull().references(() => filesTable.id, { onDelete: "cascade" }),
});

export const insertDuplicateGroupSchema = createInsertSchema(duplicateGroupsTable).omit({ id: true });
export type InsertDuplicateGroup = z.infer<typeof insertDuplicateGroupSchema>;
export type DuplicateGroup = typeof duplicateGroupsTable.$inferSelect;
