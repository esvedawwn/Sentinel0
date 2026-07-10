import { Router, type IRouter } from "express";
import { db, findingsTable, ignoredFindingsTable, findingAuditTable, actionQueueTable, type FindingAuditAction } from "@workspace/db";
import { eq, and, count, like, or, inArray } from "drizzle-orm";
import {
  ListFindingsQueryParams,
  GetFindingsSummaryQueryParams,
  ClearFindingsQueryParams,
  IgnoreFindingParams,
  IgnoreFindingBody,
  ReviewFindingParams,
  ReviewFindingBody,
  BulkReviewFindingsBody,
  GetFindingAuditParams,
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
    reviewStatus: f.reviewStatus,
    reviewedAt: f.reviewedAt?.toISOString() ?? null,
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

/**
 * Map a review action to the resulting reviewStatus and, when the action
 * implies a proposed file operation (accept_recommendation), the action
 * queue entry to create. This never performs any filesystem operation —
 * `accept_recommendation` only records intent in `action_queue`.
 */
function reviewStatusForAction(action: FindingAuditAction): typeof findingsTable.$inferSelect["reviewStatus"] {
  switch (action) {
    case "mark_reviewed":
      return "reviewed";
    case "accept_recommendation":
      return "accepted";
    case "reject_recommendation":
      return "rejected";
    case "ignore_once":
    case "ignore_permanently":
      return "ignored";
    case "create_rule":
      return "reviewed";
    default:
      return "reviewed";
  }
}

async function applyReview(
  finding: typeof findingsTable.$inferSelect,
  action: FindingAuditAction,
  note: string | null
) {
  const newReviewStatus = reviewStatusForAction(action);

  const [updated] = await db
    .update(findingsTable)
    .set({ reviewStatus: newReviewStatus, reviewedAt: new Date() })
    .where(eq(findingsTable.id, finding.id))
    .returning();

  await db.insert(findingAuditTable).values({
    findingId: finding.id,
    action,
    previousReviewStatus: finding.reviewStatus,
    newReviewStatus,
    note,
  });

  // accept_recommendation only ever creates a *proposed* action-queue entry —
  // it never touches the filesystem.
  if (action === "accept_recommendation" && finding.aiSuggestedAction) {
    await db.insert(actionQueueTable).values({
      findingId: finding.id,
      actionType: finding.aiSuggestedDestination ? "move" : "archive",
      proposedDestination: finding.aiSuggestedDestination ?? null,
      description: finding.aiSuggestedAction,
      status: "pending",
    });
  }

  return updated;
}

router.patch("/findings/:id/review", async (req, res): Promise<void> => {
  const params = ReviewFindingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }
  const body = ReviewFindingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [finding] = await db.select().from(findingsTable).where(eq(findingsTable.id, params.data.id));
  if (!finding) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }

  const updated = await applyReview(finding, body.data.action, body.data.note ?? null);
  res.json(mapFinding(updated));
});

router.post("/findings/bulk-review", async (req, res): Promise<void> => {
  const body = BulkReviewFindingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const findings = await db.select().from(findingsTable).where(inArray(findingsTable.id, body.data.ids));
  for (const finding of findings) {
    await applyReview(finding, body.data.action, body.data.note ?? null);
  }

  res.json({ updated: findings.length });
});

router.get("/findings/:id/audit", async (req, res): Promise<void> => {
  const params = GetFindingAuditParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }

  const entries = await db
    .select()
    .from(findingAuditTable)
    .where(eq(findingAuditTable.findingId, params.data.id))
    .orderBy(findingAuditTable.createdAt);

  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      findingId: e.findingId,
      action: e.action,
      previousReviewStatus: e.previousReviewStatus ?? null,
      newReviewStatus: e.newReviewStatus,
      note: e.note ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
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
