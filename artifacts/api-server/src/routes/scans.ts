import path from "path";
import fs from "fs/promises";
import { Router, type IRouter } from "express";
import { db, scansTable, filesTable, activityTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { CreateScanBody, GetScanParams, CancelScanParams, ListScansQueryParams } from "@workspace/api-zod";
import { runRealScan } from "../scanner/realScanner.js";

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

  // When mode is "sample", always use the workspace sample-data directory
  if (mode === "sample") {
    scanPath = SAMPLE_DATA_PATH;
  }

  // Auto-upgrade to real scan if the path exists on the filesystem
  if (mode === "simulate" && scanPath.startsWith("/")) {
    try {
      await fs.access(scanPath);
      // Path exists on FS — run as real scan
      mode = "real";
    } catch {
      // Path doesn't exist, keep simulate mode
    }
  }

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
    simulateScan(scan.id, scanPath);
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

async function simulateScan(scanId: number, scanPath: string) {
  const categories = ["Legal", "Banking", "Design", "Templates", "Screenshots", "Security", "Media", "Documents", "Projects", "Downloads"];
  const statuses: Array<"ready" | "review" | "action_required" | "corrupted"> = ["ready", "ready", "ready", "ready", "review", "review", "action_required", "corrupted"];
  const extensions = [".pdf", ".docx", ".jpg", ".png", ".xlsx", ".psd", ".ai", ".mp4", ".zip", ".txt", ".csv", ".mov"];

  const totalFiles = Math.floor(Math.random() * 5000) + 500;
  await db.update(scansTable).set({ filesTotal: totalFiles }).where(eq(scansTable.id, scanId));

  const steps = 10;
  for (let step = 1; step <= steps; step++) {
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const [currentScan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!currentScan || currentScan.status === "cancelled") return;

    const filesScanned = Math.floor((totalFiles * step) / steps);
    const progress = Math.floor((step / steps) * 100);

    const batchSize = Math.floor(totalFiles / steps);
    const fileRows = Array.from({ length: Math.min(batchSize, 50) }, (_, i) => {
      const ext = extensions[Math.floor(Math.random() * extensions.length)];
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const stat = statuses[Math.floor(Math.random() * statuses.length)];
      const name = `file_${scanId}_${step}_${i}${ext}`;
      return {
        name,
        path: `${scanPath}/${cat}/${name}`,
        extension: ext,
        sizeBytes: Math.floor(Math.random() * 50_000_000) + 1000,
        category: cat,
        status: stat,
        tags: [cat.toLowerCase()],
      };
    });

    await db.insert(filesTable).values(fileRows);
    await db.update(scansTable).set({ filesScanned, progressPercent: progress }).where(eq(scansTable.id, scanId));

    if (step === 5) {
      await db.insert(activityTable).values({
        type: "classification_complete",
        message: `Classification complete — ${Math.floor(totalFiles / 2).toLocaleString()} files categorised`,
        status: "success",
      });
    }
  }

  const [finalFileCount] = await db.select({ total: count() }).from(filesTable);
  const corruptedCount = Math.floor(Math.random() * 25) + 5;
  const duplicatesCount = Math.floor(Math.random() * 200) + 50;

  await db
    .update(scansTable)
    .set({
      status: "completed",
      filesScanned: totalFiles,
      progressPercent: 100,
      completedAt: new Date(),
      duplicatesFound: duplicatesCount,
      corruptedFound: corruptedCount,
    })
    .where(eq(scansTable.id, scanId));

  await db.insert(activityTable).values([
    {
      type: "duplicate_found",
      message: `${duplicatesCount} potential duplicates detected`,
      status: "warning",
    },
    {
      type: "scan_complete",
      message: `Scan complete — ${totalFiles.toLocaleString()} files processed`,
      status: "success",
    },
  ]);
}

export default router;
