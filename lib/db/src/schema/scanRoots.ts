import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Remembers directory paths that have been scanned before, so users can
 * quickly re-launch a scan against a familiar root without retyping it.
 */
export const scanRootsTable = sqliteTable(
  "scan_roots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    path: text("path").notNull().unique(),
    label: text("label"),
    scanCount: integer("scan_count").notNull().default(0),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("scan_roots_path_idx").on(table.path)]
);

export const insertScanRootSchema = createInsertSchema(scanRootsTable).omit({ id: true });
export type InsertScanRoot = z.infer<typeof insertScanRootSchema>;
export type ScanRoot = typeof scanRootsTable.$inferSelect;
