import { Router, type IRouter } from "express";
import { db, scansTable, filesTable, duplicateGroupsTable } from "@workspace/db";
import { desc, count, sql } from "drizzle-orm";
import { GetReportsScanHistoryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const categoryMeta: Record<string, { label: string; icon: string }> = {
  Legal: { label: "Legal", icon: "Legal" },
  Banking: { label: "Banking & Finance", icon: "Banking" },
  Design: { label: "Design", icon: "Design" },
  Templates: { label: "Templates", icon: "Templates" },
  Screenshots: { label: "Screenshots", icon: "Screenshots" },
  Security: { label: "Passwords & Recovery", icon: "Security" },
  Media: { label: "Photos & Media", icon: "Media" },
  Documents: { label: "Documents", icon: "Documents" },
  Projects: { label: "Projects", icon: "Projects" },
  Downloads: { label: "Downloads", icon: "Downloads" },
};

router.get("/reports/overview", async (_req, res): Promise<void> => {
  const [fileStats] = await db
    .select({
      total: count(),
      totalSizeBytes: sql<number>`coalesce(sum(size_bytes), 0)`,
    })
    .from(filesTable);

  const [scanStats] = await db.select({ total: count() }).from(scansTable);

  const [dupStats] = await db
    .select({
      resolved: sql<number>`sum(case when status = 'resolved' then 1 else 0 end)`,
      savedBytes: sql<number>`coalesce(sum(saved_bytes), 0)`,
    })
    .from(duplicateGroupsTable);

  const totalFiles = Number(fileStats?.total ?? 0);

  const categoryRows = await db
    .select({ category: filesTable.category, count: count() })
    .from(filesTable)
    .groupBy(filesTable.category)
    .orderBy(desc(count()));

  const fileTypeRows = await db
    .select({
      extension: filesTable.extension,
      count: count(),
      sizeBytes: sql<number>`coalesce(sum(size_bytes), 0)`,
    })
    .from(filesTable)
    .groupBy(filesTable.extension)
    .orderBy(desc(count()))
    .limit(20);

  const recentScans = await db
    .select()
    .from(scansTable)
    .orderBy(desc(scansTable.startedAt))
    .limit(30);

  const scanHistory = recentScans.map((s) => ({
    date: s.startedAt.toISOString().split("T")[0],
    filesScanned: s.filesScanned,
    duplicatesFound: s.duplicatesFound,
  }));

  res.json({
    totalFilesIndexed: totalFiles,
    totalScans: Number(scanStats?.total ?? 0),
    duplicatesResolved: Number(dupStats?.resolved ?? 0),
    spaceSavedBytes: Number(dupStats?.savedBytes ?? 0),
    categoryBreakdown: categoryRows.map((r) => ({
      category: r.category,
      label: categoryMeta[r.category]?.label ?? r.category,
      icon: categoryMeta[r.category]?.icon ?? r.category,
      count: Number(r.count),
      percentOfTotal: totalFiles > 0 ? Math.round((Number(r.count) / totalFiles) * 1000) / 10 : 0,
    })),
    fileTypeBreakdown: fileTypeRows.map((r) => ({
      extension: r.extension,
      count: Number(r.count),
      sizeBytes: Number(r.sizeBytes),
    })),
    scanHistory,
  });
});

router.get("/reports/scan-history", async (req, res): Promise<void> => {
  const params = GetReportsScanHistoryQueryParams.safeParse(req.query);
  const days = params.success ? (params.data.days ?? 30) : 30;

  // SQLite date arithmetic: datetime('now', '-N days')
  const scans = await db
    .select()
    .from(scansTable)
    .where(sql`started_at >= strftime('%s', datetime('now', ${`-${days} days`}))`)
    .orderBy(desc(scansTable.startedAt));

  res.json(
    scans.map((s) => ({
      date: s.startedAt.toISOString().split("T")[0],
      filesScanned: s.filesScanned,
      duplicatesFound: s.duplicatesFound,
    }))
  );
});

export default router;
