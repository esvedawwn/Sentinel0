import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "running",
  "completed",
  "cancelled",
  "failed",
]);

export const scansTable = pgTable("scans", {
  id: serial("id").primaryKey(),
  path: text("path").notNull(),
  status: scanStatusEnum("status").notNull().default("pending"),
  filesScanned: integer("files_scanned").notNull().default(0),
  filesTotal: integer("files_total").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  duplicatesFound: integer("duplicates_found").notNull().default(0),
  corruptedFound: integer("corrupted_found").notNull().default(0),
});

export const insertScanSchema = createInsertSchema(scansTable).omit({ id: true });
export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;
