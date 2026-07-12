import { Router, type IRouter } from "express";
import { db, scanRootsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateScanRootBody, DeleteScanRootParams } from "@workspace/api-zod";
import { sanitiseScanInput, checkNotSystemPath } from "../scanner/pathSafety.js";

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

router.post("/scan-roots", async (req, res): Promise<void> => {
  const parsed = CreateScanRootBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { path: rawPath, label } = parsed.data;

  // Validate: no traversal, must be absolute
  const sanitised = sanitiseScanInput(rawPath);
  if (!sanitised.ok) {
    res.status(400).json({ error: sanitised.reason });
    return;
  }
  const normPath = (sanitised as import("../scanner/pathSafety.js").SafetyOkValue<string>).value;

  // Validate: not a system-reserved directory
  const sysCheck = checkNotSystemPath(normPath);
  if (!sysCheck.ok) {
    res.status(403).json({ error: sysCheck.reason });
    return;
  }

  const existing = await db
    .select()
    .from(scanRootsTable)
    .where(eq(scanRootsTable.path, normPath));

  if (existing.length > 0) {
    res.status(409).json({ error: "Path already registered as a scan root." });
    return;
  }

  const [created] = await db
    .insert(scanRootsTable)
    .values({ path: normPath, label: label ?? null })
    .returning();

  res.status(201).json(mapScanRoot(created));
});

router.delete("/scan-roots/:id", async (req, res): Promise<void> => {
  const params = DeleteScanRootParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan root ID" });
    return;
  }

  const [deleted] = await db
    .delete(scanRootsTable)
    .where(eq(scanRootsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Scan root not found" });
    return;
  }

  res.json({ deleted: true });
});

export default router;
