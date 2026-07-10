import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

export type QueuedActionType = "move" | "delete" | "archive" | "rename";
export type QueuedActionStatus = "pending" | "dismissed";

/**
 * A *proposed* future file operation, created when a user accepts an AI
 * recommendation. This table only records intent — nothing here is ever
 * executed automatically, and no code path in this app performs the
 * filesystem operation it describes. It exists purely so users can review,
 * batch, and (in a future release) explicitly trigger real operations.
 */
export const actionQueueTable = sqliteTable(
  "action_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    actionType: text("action_type").$type<QueuedActionType>().notNull(),
    proposedDestination: text("proposed_destination"),
    description: text("description").notNull().default(""),
    status: text("status").$type<QueuedActionStatus>().notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("action_queue_finding_id_idx").on(table.findingId),
    index("action_queue_status_idx").on(table.status),
  ]
);

export const insertActionQueueSchema = createInsertSchema(actionQueueTable, {
  actionType: z.enum(["move", "delete", "archive", "rename"]),
  status: z.enum(["pending", "dismissed"]),
}).omit({ id: true });
export type InsertActionQueue = z.infer<typeof insertActionQueueSchema>;
export type ActionQueueItem = typeof actionQueueTable.$inferSelect;
