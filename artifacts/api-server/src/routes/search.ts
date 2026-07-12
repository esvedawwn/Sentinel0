import { Router, type IRouter } from "express";
import { db, searchHistoryTable, savedSearchesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import {
  SearchQueryParams,
  ListSearchHistoryQueryParams,
  CreateSavedSearchBody,
  UpdateSavedSearchParams,
  UpdateSavedSearchBody,
  DeleteSavedSearchParams,
} from "@workspace/api-zod";
import { runSearch } from "../search/searchService.js";

const router: IRouter = Router();

function mapFinding(f: Awaited<ReturnType<typeof runSearch>>["findings"][number]) {
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
    aiCategory: f.aiCategory ?? null,
    aiSubcategory: f.aiSubcategory ?? null,
    aiConfidence: f.aiConfidence ?? null,
    aiExplanation: f.aiExplanation ?? null,
    aiTags: f.aiTags ?? null,
    aiSuggestedDestination: f.aiSuggestedDestination ?? null,
    aiSuggestedAction: f.aiSuggestedAction ?? null,
    aiProvider: f.aiProvider ?? null,
    // Hybrid scoring fields (v2)
    relevanceScore: f.relevanceScore,
    matchedFactors: f.matchedFactors,
    matchExplanation: f.matchExplanation,
  };
}

router.get("/search", async (req, res): Promise<void> => {
  const params = SearchQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { q, limit, offset, recordHistory, ...filters } = params.data;

  // Parse comma-separated list params that arrive as strings from query string
  const extensionsRaw = (req.query.extensions as string | undefined)?.split(",").map((e) => e.trim()).filter(Boolean) ?? undefined;
  const findingTypesRaw = (req.query.findingTypes as string | undefined)?.split(",").map((t) => t.trim()).filter(Boolean) ?? undefined;

  const result = await runSearch({
    q,
    limit,
    offset,
    ...filters,
    extensions: extensionsRaw,
    findingTypes: findingTypesRaw,
    mentionedEntity: (req.query.mentionedEntity as string | undefined) ?? undefined,
  });

  if (recordHistory !== false) {
    await db.insert(searchHistoryTable).values({
      query: result.query,
      filters: result.filters,
      resultCount: result.total,
    });
  }

  res.json({
    query: result.query,
    filters: result.filters,
    explanation: result.explanation,
    confidence: result.confidence,
    appliedFilters: result.appliedFilters,
    unrecognizedTerms: result.unrecognizedTerms,
    findings: result.findings.map(mapFinding),
    total: result.total,
  });
});

router.get("/search/history", async (req, res): Promise<void> => {
  const params = ListSearchHistoryQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;

  const history = await db
    .select()
    .from(searchHistoryTable)
    .orderBy(desc(searchHistoryTable.createdAt))
    .limit(limit);

  res.json({
    history: history.map((h) => ({
      id: h.id,
      query: h.query,
      filters: h.filters,
      resultCount: h.resultCount,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

router.delete("/search/history", async (_req, res): Promise<void> => {
  const [{ total }] = await db.select({ total: count() }).from(searchHistoryTable);
  await db.delete(searchHistoryTable);
  res.json({ cleared: total });
});

router.get("/search/saved", async (_req, res): Promise<void> => {
  const saved = await db.select().from(savedSearchesTable).orderBy(desc(savedSearchesTable.createdAt));
  res.json({
    savedSearches: saved.map((s) => ({
      id: s.id,
      name: s.name,
      query: s.query,
      filters: s.filters,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
});

router.post("/search/saved", async (req, res): Promise<void> => {
  const body = CreateSavedSearchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [created] = await db
    .insert(savedSearchesTable)
    .values({ name: body.data.name, query: body.data.query ?? "", filters: body.data.filters })
    .returning();

  res.json({
    id: created.id,
    name: created.name,
    query: created.query,
    filters: created.filters,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

router.patch("/search/saved/:id", async (req, res): Promise<void> => {
  const params = UpdateSavedSearchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid saved search ID" });
    return;
  }
  const body = UpdateSavedSearchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(savedSearchesTable)
    .set({
      ...(body.data.name != null ? { name: body.data.name } : {}),
      ...(body.data.query != null ? { query: body.data.query } : {}),
      ...(body.data.filters != null ? { filters: body.data.filters } : {}),
      updatedAt: new Date(),
    })
    .where(eq(savedSearchesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Saved search not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    query: updated.query,
    filters: updated.filters,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

router.delete("/search/saved/:id", async (req, res): Promise<void> => {
  const params = DeleteSavedSearchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid saved search ID" });
    return;
  }
  const deleted = await db
    .delete(savedSearchesTable)
    .where(eq(savedSearchesTable.id, params.data.id))
    .returning();

  res.json({ deleted: deleted.length > 0 });
});

export default router;
