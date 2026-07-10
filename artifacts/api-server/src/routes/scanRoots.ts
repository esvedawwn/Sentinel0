import { Router, type IRouter } from "express";
import { db, scanRootsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

function mapScanRoot(r: typeof scanRootsTable.$inferSelect) {
  return {
    id: r.id,
    path: r.path,
    label: r.label ?? null,
    scanCount: r.scanCount,
    lastScannedAt: r.lastScannedAt.toISOString(),
  };
}

router.get("/scan-roots", async (_req, res): Promise<void> => {
  const roots = await db.select().from(scanRootsTable).orderBy(desc(scanRootsTable.lastScannedAt));
  res.json({ roots: roots.map(mapScanRoot) });
});

export default router;
