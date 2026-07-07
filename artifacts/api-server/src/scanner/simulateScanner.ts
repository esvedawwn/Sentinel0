import { db, scansTable, filesTable, activityTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const CATEGORIES = ["Legal", "Banking", "Design", "Templates", "Screenshots", "Security", "Media", "Documents", "Projects", "Downloads"];
const STATUSES = ["ready", "ready", "ready", "ready", "review", "review", "action_required", "corrupted"] as const;
const EXTENSIONS = [".pdf", ".docx", ".jpg", ".png", ".xlsx", ".psd", ".ai", ".mp4", ".zip", ".txt", ".csv", ".mov"];

/**
 * Simulate a scan by inserting synthetic file records into the DB over ~12 seconds.
 * Used for demo/preview purposes when no real filesystem path is available.
 */
export async function simulateScan(scanId: number, scanPath: string): Promise<void> {
  const totalFiles = Math.floor(Math.random() * 5000) + 500;
  await db.update(scansTable).set({ filesTotal: totalFiles }).where(eq(scansTable.id, scanId));

  const steps = 10;
  for (let step = 1; step <= steps; step++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));

    const [currentScan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!currentScan || currentScan.status === "cancelled") return;

    const filesScanned = Math.floor((totalFiles * step) / steps);
    const progress = Math.floor((step / steps) * 100);
    const batchSize = Math.floor(totalFiles / steps);

    const fileRows = Array.from({ length: Math.min(batchSize, 50) }, (_, i) => {
      const ext = EXTENSIONS[Math.floor(Math.random() * EXTENSIONS.length)];
      const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      const stat = STATUSES[Math.floor(Math.random() * STATUSES.length)];
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

  await db.select({ total: count() }).from(filesTable);
  const corruptedCount = Math.floor(Math.random() * 25) + 5;
  const duplicatesCount = Math.floor(Math.random() * 200) + 50;

  await db.update(scansTable).set({
    status: "completed",
    filesScanned: totalFiles,
    progressPercent: 100,
    completedAt: new Date(),
    duplicatesFound: duplicatesCount,
    corruptedFound: corruptedCount,
  }).where(eq(scansTable.id, scanId));

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
