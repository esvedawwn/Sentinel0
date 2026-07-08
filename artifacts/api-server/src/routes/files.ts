import { Router, type IRouter } from "express";
import { db, filesTable } from "@workspace/db";
import { eq, desc, like, and, count, sql } from "drizzle-orm";
import { GetFileParams, UpdateFileParams, UpdateFileBody, ListFilesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function mapFile(f: typeof filesTable.$inferSelect) {
  return {
    id: f.id,
    name: f.name,
    path: f.path,
    extension: f.extension,
    sizeBytes: f.sizeBytes,
    category: f.category,
    subcategory: f.subcategory ?? null,
    status: f.status,
    tags: f.tags,
    renamedName: f.renamedName ?? null,
    createdAt: f.createdAt.toISOString(),
    indexedAt: f.indexedAt.toISOString(),
  };
}

router.get("/files/stats", async (_req, res): Promise<void> => {
  const [stats] = await db
    .select({
      total: count(),
      totalSizeBytes: sql<number>`coalesce(sum(size_bytes), 0)`,
      ready: sql<number>`sum(case when status = 'ready' then 1 else 0 end)`,
      review: sql<number>`sum(case when status = 'review' then 1 else 0 end)`,
      action_required: sql<number>`sum(case when status = 'action_required' then 1 else 0 end)`,
      corrupted: sql<number>`sum(case when status = 'corrupted' then 1 else 0 end)`,
    })
    .from(filesTable);

  res.json({
    total: Number(stats?.total ?? 0),
    byStatus: {
      ready: Number(stats?.ready ?? 0),
      review: Number(stats?.review ?? 0),
      action_required: Number(stats?.action_required ?? 0),
      corrupted: Number(stats?.corrupted ?? 0),
    },
    totalSizeBytes: Number(stats?.totalSizeBytes ?? 0),
  });
});

router.get("/files", async (req, res): Promise<void> => {
  const params = ListFilesQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const conditions = [];

  if (params.success && params.data.category) {
    conditions.push(eq(filesTable.category, params.data.category));
  }
  if (params.success && params.data.status) {
    conditions.push(eq(filesTable.status, params.data.status as "ready" | "review" | "action_required" | "corrupted"));
  }
  if (params.success && params.data.search) {
    // SQLite LIKE is case-insensitive for ASCII by default
    conditions.push(like(filesTable.name, `%${params.data.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [files, [totalRow]] = await Promise.all([
    db
      .select()
      .from(filesTable)
      .where(whereClause)
      .orderBy(desc(filesTable.indexedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(filesTable).where(whereClause),
  ]);

  res.json({
    files: files.map(mapFile),
    total: Number(totalRow?.total ?? 0),
  });
});

router.get("/files/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetFileParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid file ID" });
    return;
  }

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, params.data.id));
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.json(mapFile(file));
});

router.patch("/files/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateFileParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid file ID" });
    return;
  }

  const body = UpdateFileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Partial<typeof filesTable.$inferInsert> = {};
  if (body.data.category !== undefined) updates.category = body.data.category;
  if (body.data.subcategory !== undefined) updates.subcategory = body.data.subcategory;
  if (body.data.tags !== undefined) updates.tags = body.data.tags;
  if (body.data.status !== undefined) updates.status = body.data.status as "ready" | "review" | "action_required";

  const [file] = await db
    .update(filesTable)
    .set(updates)
    .where(eq(filesTable.id, params.data.id))
    .returning();

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.json(mapFile(file));
});

export default router;
