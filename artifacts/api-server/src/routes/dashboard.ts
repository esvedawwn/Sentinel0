import { Router, type IRouter } from "express";
import { db, scansTable, filesTable, duplicateGroupsTable, activityTable, findingsTable } from "@workspace/db";
import { sql, eq, desc, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [fileCounts] = await db
    .select({
      total: count(),
      ready: sql<number>`sum(case when status = 'ready' then 1 else 0 end)::int`,
      corrupted: sql<number>`sum(case when status = 'corrupted' then 1 else 0 end)::int`,
    })
    .from(filesTable);

  const total = Number(fileCounts?.total ?? 0);
  const corrupted = Number(fileCounts?.corrupted ?? 0);
  const ready = Number(fileCounts?.ready ?? 0);
  const organised = total > 0 ? Math.round((ready / total) * 1000) / 10 : 0;

  const [dupCounts] = await db
    .select({ total: count() })
    .from(duplicateGroupsTable)
    .where(eq(duplicateGroupsTable.status, "pending"));

  const [activeScan] = await db
    .select()
    .from(scansTable)
    .where(eq(scansTable.status, "running"))
    .limit(1);

  const [lastScan] = await db
    .select()
    .from(scansTable)
    .where(sql`status in ('completed', 'cancelled', 'failed')`)
    .orderBy(desc(scansTable.completedAt))
    .limit(1);

  const [resolvedDups] = await db
    .select({ saved: sql<number>`coalesce(sum(saved_bytes), 0)::bigint` })
    .from(duplicateGroupsTable)
    .where(eq(duplicateGroupsTable.status, "resolved"));

  // Sum of sizes of all non-duplicate findings (files that could be removed)
  const [recoverableResult] = await db
    .select({ bytes: sql<number>`coalesce(sum(size_bytes), 0)::bigint` })
    .from(findingsTable)
    .where(sql`finding_status != 'duplicate'`);

  res.json({
    totalFiles: total,
    organisedPercent: organised,
    duplicatesCount: Number(dupCounts?.total ?? 0),
    spaceSavedBytes: Number(resolvedDups?.saved ?? 0),
    bytesRecoverable: Number(recoverableResult?.bytes ?? 0),
    corruptedCount: corrupted,
    inProgressScans: activeScan ? 1 : 0,
    systemStatus: activeScan ? "scanning" : total > 0 ? "ready" : "idle",
    lastScanAt: lastScan?.completedAt?.toISOString() ?? null,
    currentScanPath: activeScan?.path ?? null,
    currentScanProgress: activeScan?.progressPercent ?? null,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const entries = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.timestamp))
    .limit(limit);

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

router.get("/dashboard/category-breakdown", async (req, res): Promise<void> => {
  const [total] = await db.select({ total: count() }).from(filesTable);
  const totalCount = Number(total?.total ?? 0);

  const rows = await db
    .select({
      category: filesTable.category,
      count: count(),
    })
    .from(filesTable)
    .groupBy(filesTable.category)
    .orderBy(desc(count()));

  const categoryMeta: Record<string, { label: string; icon: string }> = {
    Legal: { label: "Legal", icon: "⚖" },
    Banking: { label: "Banking & Finance", icon: "🏦" },
    Design: { label: "Design", icon: "🎨" },
    Templates: { label: "Templates", icon: "📋" },
    Screenshots: { label: "Screenshots", icon: "📸" },
    Security: { label: "Passwords & Recovery", icon: "🔐" },
    Media: { label: "Photos & Media", icon: "🎬" },
    Documents: { label: "Documents", icon: "📄" },
    Projects: { label: "Projects", icon: "📂" },
    Downloads: { label: "Downloads", icon: "⬇" },
  };

  res.json(
    rows.map((r) => ({
      category: r.category,
      label: categoryMeta[r.category]?.label ?? r.category,
      icon: categoryMeta[r.category]?.icon ?? "📁",
      count: Number(r.count),
      percentOfTotal: totalCount > 0 ? Math.round((Number(r.count) / totalCount) * 1000) / 10 : 0,
    }))
  );
});

router.get("/dashboard/needs-attention", async (req, res): Promise<void> => {
  const [corrupted] = await db
    .select({ count: count() })
    .from(filesTable)
    .where(eq(filesTable.status, "corrupted"));

  const [duplicates] = await db
    .select({ count: count() })
    .from(duplicateGroupsTable)
    .where(eq(duplicateGroupsTable.status, "pending"));

  const [untagged] = await db
    .select({ count: count() })
    .from(filesTable)
    .where(sql`array_length(tags, 1) IS NULL OR array_length(tags, 1) = 0`);

  res.json({
    corruptedFiles: Number(corrupted?.count ?? 0),
    duplicates: Number(duplicates?.count ?? 0),
    untaggedFiles: Number(untagged?.count ?? 0),
  });
});

export default router;
