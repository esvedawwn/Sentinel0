import { Router, type IRouter } from "express";
import { db, findingsTable } from "@workspace/db";
import { eq, and, count, like, or } from "drizzle-orm";
import { ListFindingsQueryParams, GetFindingsSummaryQueryParams, ClearFindingsQueryParams } from "@workspace/api-zod";

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
    reason: f.reason,
    createdAt: f.createdAt.toISOString(),
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
    // SQLite LIKE is case-insensitive for ASCII by default
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
