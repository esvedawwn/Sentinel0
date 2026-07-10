import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Singleton settings row (id is always 1) controlling document text
 * extraction / OCR / privacy behavior. Everything defaults to the safest,
 * fully-offline, opt-in posture — extraction and OCR must be explicitly
 * enabled, and cloud processing additionally requires `cloudConsent`.
 */
export const userSettingsTable = sqliteTable("user_settings", {
  id: integer("id").primaryKey().default(1),
  textExtractionEnabled: integer("text_extraction_enabled", { mode: "boolean" }).notNull().default(false),
  ocrEnabled: integer("ocr_enabled", { mode: "boolean" }).notNull().default(false),
  localOnlyProcessing: integer("local_only_processing", { mode: "boolean" }).notNull().default(true),
  cloudConsent: integer("cloud_consent", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertUserSettingsSchema = createInsertSchema(userSettingsTable).omit({ id: true });
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettingsTable.$inferSelect;
