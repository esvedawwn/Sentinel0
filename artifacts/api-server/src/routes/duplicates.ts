import { Router, type IRouter } from "express";
import { db, duplicateGroupsTable, findingsTable, activityTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { ResolveDuplicateParams, ResolveDuplicateBody, ListDuplicatesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function buildGroupResponse(group: typeof duplicateGroupsTable.$inferSelect) {
  const members = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.duplicateGroupId, group.id));

  const oneCopySize = members.length > 0
    ? Math.min(...members.map((m) => m.sizeBytes ?? 0))
    : 0;
  const wastedBytes = Math.max(group.totalSizeBytes - oneCopySize, 0);

  return {
    id: group.id,
    hash: group.hash ?? null,
    status: group.status,
    totalSizeBytes: group.totalSizeBytes,
    wastedBytes,
    savedBytes: group.savedBytes,
    confidence: group.confidence,
    explanation: group.explanation,
    canonicalFindingId: group.canonicalFindingId ?? null,
    createdAt: group.createdAt.toISOString(),
    resolvedAt: group.resolvedAt?.toISOString() ?? null,
    members: members.map((m) => ({
      findingId: m.id,
      path: m.path,
      name: m.name,
      extension: m.extension ?? "",
      sizeBytes: m.sizeBytes ?? 0,
      modifiedAt: m.fileModifiedAt?.toISOString() ?? null,
      isCanonical: m.id === group.canonicalFindingId,
    })),
  };
}

router.get("/duplicates", async (req, res): Promise<void> => {
  const params = ListDuplicatesQueryParams.safeParse(req.query);
  const limit = params.success ? params.data.limit : 20;
  const offset = params.success ? params.data.offset : 0;
  const statusFilter = params.success ? params.data.status : undefined;
  const sort = params.success ? params.data.sort : "wastedBytes";

  const query = db.select().from(duplicateGroupsTable);
  const filtered = statusFilter
    ? query.where(eq(duplicateGroupsTable.status, statusFilter))
    : query;

  // Wasted-bytes sort requires per-group member sizes, which aren't a plain
  // column — fetch candidates then sort/paginate in memory. Group counts are
  // small enough (bounded by scan size) for this to be cheap.
  const allGroups = await filtered.orderBy(desc(duplicateGroupsTable.createdAt));
  const responses = await Promise.all(allGroups.map(buildGroupResponse));

  const sorted = sort === "wastedBytes"
    ? responses.sort((a, b) => b.wastedBytes - a.wastedBytes)
    : responses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const page = sorted.slice(offset, offset + limit);

  const [totalRow] = await db.select({ total: count() }).from(duplicateGroupsTable);
  const [saveable] = await db
    .select({ total: sql<number>`coalesce(sum(total_size_bytes - coalesce(saved_bytes, 0)), 0)` })
    .from(duplicateGroupsTable)
    .where(eq(duplicateGroupsTable.status, "pending"));

  res.json({
    groups: page,
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

  if (body.data.action === "keep_one" && body.data.keepFindingId != null) {
    const [keptFinding] = await db
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.id, body.data.keepFindingId));
    if (!keptFinding || keptFinding.duplicateGroupId !== group.id) {
      res.status(400).json({ error: "keepFindingId must belong to this duplicate group" });
      return;
    }
  }

  const members = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.duplicateGroupId, group.id));
  const oneCopySize = members.length > 0 ? Math.min(...members.map((m) => m.sizeBytes ?? 0)) : 0;
  const wastedBytes = Math.max(group.totalSizeBytes - oneCopySize, 0);

  // Marking "keep_one" only records intent (which copy to keep) — it never
  // deletes files. Any actual file removal is a separate, future, explicitly
  // confirmed cleanup action.
  const savedBytes = body.data.action === "keep_one" ? wastedBytes : 0;
  const status = body.data.action === "ignore"
    ? "ignored"
    : body.data.action === "false_positive"
      ? "false_positive"
      : "resolved";

  const [updated] = await db
    .update(duplicateGroupsTable)
    .set({
      status,
      resolvedAt: new Date(),
      savedBytes,
      canonicalFindingId: body.data.action === "keep_one" && body.data.keepFindingId != null
        ? body.data.keepFindingId
        : group.canonicalFindingId,
    })
    .where(eq(duplicateGroupsTable.id, params.data.id))
    .returning();

  const activityMessage = body.data.action === "ignore"
    ? "Duplicate group ignored"
    : body.data.action === "false_positive"
      ? "Duplicate group marked as false positive"
      : `Duplicate resolved — ${(savedBytes / 1_000_000).toFixed(1)} MB reclaimable`;

  await db.insert(activityTable).values({
    type: "scan_complete",
    message: activityMessage,
    status: body.data.action === "keep_one" ? "success" : "info",
  });

  res.json(await buildGroupResponse(updated));
});

export default router;
