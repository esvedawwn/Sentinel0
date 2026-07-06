import { Router, type IRouter } from "express";
import { db, activityTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/activity", async (req, res): Promise<void> => {
  const params = ListActivityQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const entries = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.timestamp))
    .limit(limit)
    .offset(offset);

  res.json(
    entries.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      status: e.status,
      timestamp: e.timestamp.toISOString(),
      meta: e.meta ?? {},
    }))
  );
});

export default router;
