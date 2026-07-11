import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Singleton settings row (id is always 1) controlling document text
 * extraction / OCR / embeddings / privacy behavior. Everything defaults to
 * the safest, fully-offline, opt-in posture — extraction, OCR, and
 * embeddings must be explicitly enabled, and cloud processing additionally
 * requires `cloudConsent`.
 */
export const userSettingsTable = sqliteTable("user_settings", {
  id: integer("id").primaryKey().default(1),
  textExtractionEnabled: integer("text_extraction_enabled", { mode: "boolean" }).notNull().default(false),
  ocrEnabled: integer("ocr_enabled", { mode: "boolean" }).notNull().default(false),
  localOnlyProcessing: integer("local_only_processing", { mode: "boolean" }).notNull().default(true),
  cloudConsent: integer("cloud_consent", { mode: "boolean" }).notNull().default(false),
  /**
   * When true, Sentinel may embed extracted-text chunks using the local
   * hash provider (offline, no data leaves the machine). Cloud embeddings
   * additionally require cloudConsent. Defaults to false so no embeddings
   * are generated without explicit opt-in.
   */
  embeddingsEnabled: integer("embeddings_enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertUserSettingsSchema = createInsertSchema(userSettingsTable).omit({ id: true });
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettingsTable.$inferSelect;
