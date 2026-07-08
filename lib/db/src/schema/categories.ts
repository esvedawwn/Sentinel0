import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  subfolders: text("subfolders", { mode: "json" }).$type<string[]>().notNull().default([]),
  extensions: text("extensions", { mode: "json" }).$type<string[]>().notNull().default([]),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
});

export const insertCategorySchema = createInsertSchema(categoriesTable, {
  subfolders: z.array(z.string()),
  extensions: z.array(z.string()),
  tags: z.array(z.string()),
}).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
