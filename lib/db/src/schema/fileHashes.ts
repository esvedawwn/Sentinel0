import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Cache of previously-computed content hashes, keyed by absolute path.
 * Reused across scans: if a file's size and modified time are unchanged
 * since the cached row was written, the stored hash is reused instead of
 * re-reading the file. Only structural metadata is stored — never file
 * contents.
 */
export const fileHashesTable = sqliteTable(
  "file_hashes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    path: text("path").notNull().unique(),
    sizeBytes: integer("size_bytes").notNull(),
    modifiedAt: integer("modified_at", { mode: "timestamp" }),
    hash: text("hash").notNull(),
    algo: text("algo").notNull().default("sha256"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("file_hashes_path_idx").on(table.path), index("file_hashes_hash_idx").on(table.hash)]
);

export const insertFileHashSchema = createInsertSchema(fileHashesTable).omit({ id: true });
export type InsertFileHash = z.infer<typeof insertFileHashSchema>;
export type FileHash = typeof fileHashesTable.$inferSelect;
