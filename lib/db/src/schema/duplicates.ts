import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { filesTable } from "./files";

export type DuplicateStatus = "pending" | "resolved" | "ignored";

export const duplicateGroupsTable = sqliteTable("duplicate_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").$type<DuplicateStatus>().notNull().default("pending"),
  totalSizeBytes: integer("total_size_bytes").notNull().default(0),
  savedBytes: integer("saved_bytes").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

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
  status: z.enum(["pending", "resolved", "ignored"]),
}).omit({ id: true });
export type InsertDuplicateGroup = z.infer<typeof insertDuplicateGroupSchema>;
export type DuplicateGroup = typeof duplicateGroupsTable.$inferSelect;
