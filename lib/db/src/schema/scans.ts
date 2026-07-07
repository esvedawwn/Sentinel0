import { pgTable, serial, text, integer, bigint, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "running",
  "completed",
  "cancelled",
  "failed",
]);

export const scanModeEnum = pgEnum("scan_mode", [
  "real",
  "sample",
  "simulate",
]);

export const scansTable = pgTable("scans", {
  id: serial("id").primaryKey(),
  path: text("path").notNull(),
  mode: scanModeEnum("mode").notNull().default("simulate"),
  status: scanStatusEnum("status").notNull().default("pending"),
  filesScanned: integer("files_scanned").notNull().default(0),
  foldersScanned: integer("folders_scanned").notNull().default(0),
  filesTotal: integer("files_total").notNull().default(0),
  bytesScanned: bigint("bytes_scanned", { mode: "number" }).notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  duplicatesFound: integer("duplicates_found").notNull().default(0),
  corruptedFound: integer("corrupted_found").notNull().default(0),
  findingsCount: integer("findings_count").notNull().default(0),
});

export const insertScanSchema = createInsertSchema(scansTable).omit({ id: true });
export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;
