import { pgTable, serial, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityTypeEnum = pgEnum("activity_type", [
  "scan_complete",
  "scan_started",
  "duplicate_found",
  "file_indexed",
  "classification_complete",
  "error",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "success",
  "warning",
  "info",
  "error",
]);

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: activityTypeEnum("type").notNull(),
  message: text("message").notNull(),
  status: activityStatusEnum("status").notNull().default("info"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  meta: jsonb("meta"),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
