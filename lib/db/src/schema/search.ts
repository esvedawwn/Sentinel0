import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per search a user has run (NL query text + the filters it resolved
 * to). Purely for recall/history — never used to drive results.
 */
export const searchHistoryTable = sqliteTable(
  "search_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    query: text("query").notNull(),
    filters: text("filters", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    resultCount: integer("result_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("search_history_created_at_idx").on(table.createdAt)]
);

export const insertSearchHistorySchema = createInsertSchema(searchHistoryTable).omit({ id: true });
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistoryTable.$inferSelect;

/**
 * A named, user-saved filter set. Editable and re-runnable from the Search
 * page; independent of search history.
 */
export const savedSearchesTable = sqliteTable(
  "saved_searches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    query: text("query").notNull().default(""),
    filters: text("filters", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("saved_searches_created_at_idx").on(table.createdAt)]
);

export const insertSavedSearchSchema = createInsertSchema(savedSearchesTable).omit({ id: true });
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearchesTable.$inferSelect;
