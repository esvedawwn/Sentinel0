import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type FileStatus = "ready" | "review" | "action_required" | "corrupted";

export const filesTable = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  extension: text("extension").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  category: text("category").notNull().default("Documents"),
  subcategory: text("subcategory"),
  status: text("status").$type<FileStatus>().notNull().default("ready"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  renamedName: text("renamed_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  indexedAt: integer("indexed_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertFileSchema = createInsertSchema(filesTable, {
  status: z.enum(["ready", "review", "action_required", "corrupted"]),
  tags: z.array(z.string()),
}).omit({ id: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof filesTable.$inferSelect;
