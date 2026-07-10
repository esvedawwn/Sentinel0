import { Router, type IRouter } from "express";
import { db, findingsTable, ignoredFindingsTable } from "@workspace/db";
import { eq, and, count, like, or } from "drizzle-orm";
import {
  ListFindingsQueryParams,
  GetFindingsSummaryQueryParams,
  ClearFindingsQueryParams,
  IgnoreFindingParams,
  IgnoreFindingBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapFinding(f: typeof findingsTable.$inferSelect) {
  return {
    id: f.id,
    scanId: f.scanId,
    type: f.type,
    path: f.path,
    name: f.name,
    extension: f.extension,
    sizeBytes: f.sizeBytes,
    hash: f.hash ?? null,
    duplicateGroupHash: f.duplicateGroupHash ?? null,
    findingStatus: f.findingStatus,
    riskLevel: f.riskLevel,
    reason: f.reason,
    fileCreatedAt: f.fileCreatedAt?.toISOString() ?? null,
    fileModifiedAt: f.fileModifiedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    // AI classification fields
    aiCategory: f.aiCategory ?? null,
    aiSubcategory: f.aiSubcategory ?? null,
    aiConfidence: f.aiConfidence ?? null,
    aiExplanation: f.aiExplanation ?? null,
    aiTags: f.aiTags ?? null,
    aiSuggestedDestination: f.aiSuggestedDestination ?? null,
    aiSuggestedAction: f.aiSuggestedAction ?? null,
    aiProvider: f.aiProvider ?? null,
  };
}

router.get("/findings", async (req, res): Promise<void> => {
  const params = ListFindingsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 200) : 200;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const scanId = params.success ? params.data.scanId : undefined;
  const type = params.success ? params.data.type : undefined;
  const findingStatus = params.success ? params.data.findingStatus : undefined;
  const search = params.success ? params.data.search : undefined;

  const conditions = [];
  if (scanId) conditions.push(eq(findingsTable.scanId, scanId));
  if (type) conditions.push(eq(findingsTable.type, type));
  if (findingStatus) conditions.push(eq(findingsTable.findingStatus, findingStatus));
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(
      like(findingsTable.name, term),
      like(findingsTable.path, term)
    ));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [findings, [{ total }]] = await Promise.all([
    db.select().from(findingsTable)
      .where(whereClause)
      .orderBy(findingsTable.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(findingsTable).where(whereClause),
  ]);

  res.json({ findings: findings.map(mapFinding), total });
});

router.get("/findings/summary", async (req, res): Promise<void> => {
  const params = GetFindingsSummaryQueryParams.safeParse(req.query);
  const scanId = params.success ? params.data.scanId : undefined;

  const whereClause = scanId ? eq(findingsTable.scanId, scanId) : undefined;

  const rows = await db
    .select({
      type: findingsTable.type,
      findingStatus: findingsTable.findingStatus,
      cnt: count(),
    })
    .from(findingsTable)
    .where(whereClause)
    .groupBy(findingsTable.type, findingsTable.findingStatus);

  let total = 0;
  let safeDelete = 0;
  let review = 0;
  let duplicate = 0;
  const byType: Record<string, number> = {};

  for (const row of rows) {
    total += row.cnt;
    if (row.findingStatus === "safe_delete") safeDelete += row.cnt;
    if (row.findingStatus === "review") review += row.cnt;
    if (row.findingStatus === "duplicate") duplicate += row.cnt;
    byType[row.type] = (byType[row.type] ?? 0) + row.cnt;
  }

  res.json({ total, safeDelete, review, duplicate, byType });
});

router.patch("/findings/:id/ignore", async (req, res): Promise<void> => {
  const params = IgnoreFindingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }
  const body = IgnoreFindingBody.safeParse(req.body ?? {});
  const reason = body.success ? (body.data.reason ?? null) : null;

  const [finding] = await db.select().from(findingsTable).where(eq(findingsTable.id, params.data.id));
  if (!finding) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }

  // Ignoring never deletes the finding row or its scan history — only marks it dismissed.
  await db
    .insert(ignoredFindingsTable)
    .values({ findingId: finding.id, reason })
    .onConflictDoUpdate({
      target: ignoredFindingsTable.findingId,
      set: { reason, ignoredAt: new Date() },
    });

  const [updated] = await db
    .update(findingsTable)
    .set({ findingStatus: "ignored" })
    .where(eq(findingsTable.id, finding.id))
    .returning();

  res.json(mapFinding(updated));
});

router.patch("/findings/:id/unignore", async (req, res): Promise<void> => {
  const params = IgnoreFindingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }

  const [finding] = await db.select().from(findingsTable).where(eq(findingsTable.id, params.data.id));
  if (!finding) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }

  await db.delete(ignoredFindingsTable).where(eq(ignoredFindingsTable.findingId, finding.id));

  const restoredStatus = finding.type === "duplicate" ? "duplicate" : "review";
  const [updated] = await db
    .update(findingsTable)
    .set({ findingStatus: restoredStatus })
    .where(eq(findingsTable.id, finding.id))
    .returning();

  res.json(mapFinding(updated));
});

router.delete("/findings/clear", async (req, res): Promise<void> => {
  const params = ClearFindingsQueryParams.safeParse(req.query);
  const scanId = params.success ? params.data.scanId : undefined;

  const whereClause = scanId ? eq(findingsTable.scanId, scanId) : undefined;

  const [{ cleared }] = await db
    .select({ cleared: count() })
    .from(findingsTable)
    .where(whereClause);

  await db.delete(findingsTable).where(whereClause);

  res.json({ cleared });
});

export default router;
