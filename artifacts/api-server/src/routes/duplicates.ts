import { Router, type IRouter } from "express";
import { db, duplicateGroupsTable, duplicateGroupFilesTable, filesTable, activityTable } from "@workspace/db";
import { eq, desc, count, sum, sql, inArray } from "drizzle-orm";
import { ResolveDuplicateParams, ResolveDuplicateBody, ListDuplicatesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function buildGroupResponse(group: typeof duplicateGroupsTable.$inferSelect) {
  const groupFileLinks = await db
    .select()
    .from(duplicateGroupFilesTable)
    .where(eq(duplicateGroupFilesTable.groupId, group.id));

  const fileIds = groupFileLinks.map((gf) => gf.fileId);
  const files = fileIds.length > 0
    ? await db.select().from(filesTable).where(inArray(filesTable.id, fileIds))
    : [];

  return {
    id: group.id,
    status: group.status,
    totalSizeBytes: group.totalSizeBytes,
    savedBytes: group.savedBytes,
    createdAt: group.createdAt.toISOString(),
    resolvedAt: group.resolvedAt?.toISOString() ?? null,
    files: files.map((f) => ({
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
    })),
  };
}

router.get("/duplicates", async (req, res): Promise<void> => {
  const params = ListDuplicatesQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const statusFilter = params.success ? params.data.status : undefined;

  const query = db.select().from(duplicateGroupsTable).orderBy(desc(duplicateGroupsTable.createdAt));

  const groups = statusFilter
    ? await query.where(eq(duplicateGroupsTable.status, statusFilter as "pending" | "resolved" | "ignored")).limit(limit).offset(offset)
    : await query.limit(limit).offset(offset);

  const [totalRow] = await db.select({ total: count() }).from(duplicateGroupsTable);
  const [saveable] = await db
    .select({ total: sql<number>`coalesce(sum(total_size_bytes - coalesce(saved_bytes, 0)), 0)::bigint` })
    .from(duplicateGroupsTable)
    .where(eq(duplicateGroupsTable.status, "pending"));

  const groupResponses = await Promise.all(groups.map(buildGroupResponse));

  res.json({
    groups: groupResponses,
    total: Number(totalRow?.total ?? 0),
    totalSaveable: Number(saveable?.total ?? 0),
  });
});

router.post("/duplicates/:id/resolve", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ResolveDuplicateParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid group ID" });
    return;
  }

  const body = ResolveDuplicateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [group] = await db
    .select()
    .from(duplicateGroupsTable)
    .where(eq(duplicateGroupsTable.id, params.data.id));

  if (!group) {
    res.status(404).json({ error: "Duplicate group not found" });
    return;
  }

  const savedBytes = body.data.action === "keep_one"
    ? Math.floor(group.totalSizeBytes * 0.5)
    : 0;

  const [updated] = await db
    .update(duplicateGroupsTable)
    .set({
      status: body.data.action === "ignore" ? "ignored" : "resolved",
      resolvedAt: new Date(),
      savedBytes,
    })
    .where(eq(duplicateGroupsTable.id, params.data.id))
    .returning();

  await db.insert(activityTable).values({
    type: "scan_complete",
    message: body.data.action === "ignore"
      ? `Duplicate group ignored`
      : `Duplicate resolved — ${(savedBytes / 1_000_000).toFixed(1)} MB saved`,
    status: body.data.action === "ignore" ? "info" : "success",
  });

  res.json(await buildGroupResponse(updated));
});

export default router;
