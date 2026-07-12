import path from "path";
import fs from "fs/promises";
import { Router, type IRouter } from "express";
import { db, scansTable, activityTable, scanRootsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateScanBody, GetScanParams, CancelScanParams, ListScansQueryParams } from "@workspace/api-zod";
import { runRealScan } from "../scanner/realScanner.js";
import { simulateScan } from "../scanner/simulateScanner.js";
import { sanitiseScanInput, checkNotSystemPath, validateAgainstApprovedRoots } from "../scanner/pathSafety.js";

const router: IRouter = Router();

const SAMPLE_DATA_PATH = path.resolve(process.cwd(), "../../sample-data");

function mapScan(scan: typeof scansTable.$inferSelect) {
  return {
    id: scan.id,
    path: scan.path,
    mode: scan.mode,
    status: scan.status,
    filesScanned: scan.filesScanned,
    foldersScanned: scan.foldersScanned,
    bytesScanned: scan.bytesScanned,
    filesTotal: scan.filesTotal,
    findingsCount: scan.findingsCount,
    progressPercent: scan.progressPercent,
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? null,
    errorMessage: scan.errorMessage ?? null,
    duplicatesFound: scan.duplicatesFound,
    corruptedFound: scan.corruptedFound,
  };
}

router.get("/scans", async (req, res): Promise<void> => {
  const params = ListScansQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const scans = await db
    .select()
    .from(scansTable)
    .orderBy(desc(scansTable.startedAt))
    .limit(limit)
    .offset(offset);

  res.json(scans.map(mapScan));
});

router.post("/scans", async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requestedMode = parsed.data.mode ?? "simulate";
  let scanPath = parsed.data.path.trim();
  let mode: "real" | "sample" | "simulate" = requestedMode;

  if (mode === "sample") {
    scanPath = SAMPLE_DATA_PATH;
  }

  // Auto-upgrade to real scan if path exists on filesystem
  if (mode === "simulate" && scanPath.startsWith("/")) {
    try {
      await fs.access(scanPath);
      mode = "real";
    } catch {
      // Path doesn't exist — keep simulate mode
    }
  }

  // ── Path safety validation for real scans ────────────────────────────────
  if (mode === "real") {
    // 1. Reject traversal sequences + require absolute path
    const sanitised = sanitiseScanInput(scanPath);
    if (!sanitised.ok) {
      res.status(400).json({ error: sanitised.reason });
      return;
    }
    scanPath = (sanitised as import("../scanner/pathSafety.js").SafetyOkValue<string>).value;

    // 2. Block system-reserved directories
    const sysCheck = checkNotSystemPath(scanPath);
    if (!sysCheck.ok) {
      res.status(403).json({ error: sysCheck.reason });
      return;
    }

    // 3. Enforce approved-root policy
    const roots = await db.select().from(scanRootsTable);
    const approvedPaths = roots.map((r) => r.path);
    const rootCheck = validateAgainstApprovedRoots(scanPath, approvedPaths);
    if (!rootCheck.ok) {
      res.status(403).json({ error: rootCheck.reason });
      return;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const [scan] = await db
    .insert(scansTable)
    .values({ path: scanPath, mode, status: "running", filesTotal: 0 })
    .returning();

  await db.insert(activityTable).values({
    type: "scan_started",
    message: `Scan started — ${scanPath}`,
    status: "info",
  });

  if (mode === "real" || mode === "sample") {
    runRealScan(scan.id, scanPath, mode === "sample").catch(() => {});
  } else {
    simulateScan(scan.id, scanPath).catch(() => {});
  }

  res.status(201).json(mapScan(scan));
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.json(mapScan(scan));
});

router.post("/scans/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [scan] = await db
    .update(scansTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(scansTable.id, params.data.id))
    .returning();

  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  await db.insert(activityTable).values({
    type: "scan_complete",
    message: `Scan cancelled — ${scan.path}`,
    status: "warning",
  });

  res.json(mapScan(scan));
});

export default router;
