import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scansTable } from "./scans";

export type FileStatus = "ready" | "review" | "action_required" | "corrupted";

export const filesTable = sqliteTable(
  "files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id").references(() => scansTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    path: text("path").notNull(),
    extension: text("extension").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    category: text("category").notNull().default("Documents"),
    subcategory: text("subcategory"),
    status: text("status").$type<FileStatus>().notNull().default("ready"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    renamedName: text("renamed_name"),
    // Filesystem timestamps (distinct from indexedAt, which is when Sentinel recorded the row)
    fileCreatedAt: integer("file_created_at", { mode: "timestamp" }),
    fileModifiedAt: integer("file_modified_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    indexedAt: integer("indexed_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("files_path_idx").on(table.path),
    index("files_name_idx").on(table.name),
    index("files_extension_idx").on(table.extension),
    index("files_category_idx").on(table.category),
    index("files_scan_id_idx").on(table.scanId),
    index("files_file_modified_at_idx").on(table.fileModifiedAt),
  ]
);

export const insertFileSchema = createInsertSchema(filesTable, {
  status: z.enum(["ready", "review", "action_required", "corrupted"]),
  tags: z.array(z.string()),
}).omit({ id: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof filesTable.$inferSelect;
