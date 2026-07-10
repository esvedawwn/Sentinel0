import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scansTable } from "./scans";

export type ActivityType =
  | "scan_complete"
  | "scan_started"
  | "duplicate_found"
  | "file_indexed"
  | "classification_complete"
  | "error";

export type ActivityStatus = "success" | "warning" | "info" | "error";

export const activityTable = sqliteTable(
  "activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id").references(() => scansTable.id, { onDelete: "set null" }),
    type: text("type").$type<ActivityType>().notNull(),
    message: text("message").notNull(),
    status: text("status").$type<ActivityStatus>().notNull().default("info"),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    meta: text("meta", { mode: "json" }),
  },
  (table) => [index("activity_scan_id_idx").on(table.scanId)]
);

export const insertActivitySchema = createInsertSchema(activityTable, {
  type: z.enum([
    "scan_complete",
    "scan_started",
    "duplicate_found",
    "file_indexed",
    "classification_complete",
    "error",
  ]),
  status: z.enum(["success", "warning", "info", "error"]),
}).omit({ id: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
