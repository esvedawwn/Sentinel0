import { Router, type IRouter } from "express";
import { db, actionQueueTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListActionQueueQueryParams, DismissActionQueueItemParams } from "@workspace/api-zod";

const router: IRouter = Router();

function mapItem(item: typeof actionQueueTable.$inferSelect) {
  return {
    id: item.id,
    findingId: item.findingId,
    actionType: item.actionType,
    proposedDestination: item.proposedDestination ?? null,
    description: item.description,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  };
}

// This queue only ever stores *proposed* operations. No route in this file
// (or anywhere else in the app) performs the filesystem operation it
// describes — dismiss just marks the proposal as no longer relevant.
router.get("/action-queue", async (req, res): Promise<void> => {
  const params = ListActionQueueQueryParams.safeParse(req.query);
  const status = params.success ? params.data.status : undefined;

  const query = db.select().from(actionQueueTable);
  const rows = await (status ? query.where(eq(actionQueueTable.status, status)) : query).orderBy(
    desc(actionQueueTable.createdAt)
  );

  res.json({ items: rows.map(mapItem) });
});

router.post("/action-queue/:id/dismiss", async (req, res): Promise<void> => {
  const params = DismissActionQueueItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid action queue item ID" });
    return;
  }

  const [updated] = await db
    .update(actionQueueTable)
    .set({ status: "dismissed" })
    .where(eq(actionQueueTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Action queue item not found" });
    return;
  }

  res.json(mapItem(updated));
});

export default router;
