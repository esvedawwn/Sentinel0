import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fileStatusEnum = pgEnum("file_status", [
  "ready",
  "review",
  "action_required",
  "corrupted",
]);

export const filesTable = pgTable("files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  extension: text("extension").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  category: text("category").notNull().default("Documents"),
  subcategory: text("subcategory"),
  status: fileStatusEnum("status").notNull().default("ready"),
  tags: text("tags").array().notNull().default([]),
  renamedName: text("renamed_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFileSchema = createInsertSchema(filesTable).omit({ id: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof filesTable.$inferSelect;
