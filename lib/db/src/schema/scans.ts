import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ScanStatus = "pending" | "running" | "completed" | "cancelled" | "failed";
export type ScanMode = "real" | "sample" | "simulate";

export const scansTable = sqliteTable("scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull(),
  mode: text("mode").$type<ScanMode>().notNull().default("simulate"),
  status: text("status").$type<ScanStatus>().notNull().default("pending"),
  filesScanned: integer("files_scanned").notNull().default(0),
  foldersScanned: integer("folders_scanned").notNull().default(0),
  filesTotal: integer("files_total").notNull().default(0),
  bytesScanned: integer("bytes_scanned").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  duplicatesFound: integer("duplicates_found").notNull().default(0),
  corruptedFound: integer("corrupted_found").notNull().default(0),
  findingsCount: integer("findings_count").notNull().default(0),
});

export const insertScanSchema = createInsertSchema(scansTable, {
  status: z.enum(["pending", "running", "completed", "cancelled", "failed"]),
  mode: z.enum(["real", "sample", "simulate"]),
}).omit({ id: true });
export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;
