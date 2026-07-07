import path from "path";
import { db, scansTable, findingsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { walkDirectory, computeHash, countChildren } from "./fileWalker.js";
import { classifyFile, classifyEmptyFolder, detectDuplicates } from "./findingsEngine.js";
import { ScanFinding, LARGE_FILE_BYTES } from "./types.js";

const SAMPLE_LARGE_FILE_BYTES = 1024 * 1024; // 1 MB threshold for sample scans
const BATCH_SIZE = 50;

/**
 * Run a real filesystem scan against the given path.
 * Walks files, classifies findings, hashes files for dedup.
 * Updates scan progress in the DB and fires activity events.
 */
export async function runRealScan(
  scanId: number,
  rootPath: string,
  isSample: boolean
): Promise<void> {
  const largeFileThreshold = isSample ? SAMPLE_LARGE_FILE_BYTES : LARGE_FILE_BYTES;
  const abortController = new AbortController();

  // Track state
  let filesScanned = 0;
  let foldersScanned = 0;
  let bytesScanned = 0;
  const findings: ScanFinding[] = [];
  const hashMap = new Map<string, Array<{ path: string; name: string; extension: string; sizeBytes: number }>>();
  const dirChildCount = new Map<string, number>();
  const findingBatch: (typeof findingsTable.$inferInsert)[] = [];

  async function flushFindings() {
    if (findingBatch.length === 0) return;
    const toFlush = findingBatch.splice(0);
    await db.insert(findingsTable).values(toFlush);
  }

  try {
    // Check scan hasn't been cancelled
    const [current] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!current || current.status === "cancelled") return;

    for await (const entry of walkDirectory(rootPath, abortController.signal)) {
      // Check for cancellation every 100 entries
      if ((filesScanned + foldersScanned) % 100 === 0) {
        const [check] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
        if (!check || check.status === "cancelled") {
          abortController.abort();
          return;
        }
      }

      if (entry.isDir) {
        foldersScanned++;
        const childCount = await countChildren(entry.path);
        if (childCount === 0) {
          const finding = classifyEmptyFolder(entry.path);
          findings.push(finding);
          findingBatch.push({
            scanId,
            type: finding.type,
            path: finding.path,
            name: finding.name,
            extension: finding.extension,
            sizeBytes: finding.sizeBytes,
            findingStatus: finding.findingStatus,
            reason: finding.reason,
          });
        }
      } else {
        filesScanned++;
        bytesScanned += entry.sizeBytes;

        const ext = path.extname(entry.name).toLowerCase();

        // Classify by type
        const finding = classifyFile(entry.path, entry.name, entry.sizeBytes, largeFileThreshold);
        if (finding) {
          findings.push(finding);
          findingBatch.push({
            scanId,
            type: finding.type,
            path: finding.path,
            name: finding.name,
            extension: finding.extension,
            sizeBytes: finding.sizeBytes,
            findingStatus: finding.findingStatus,
            reason: finding.reason,
          });
        }

        // Hash for duplicate detection
        const hash = await computeHash(entry.path, entry.sizeBytes);
        if (hash) {
          const existing = hashMap.get(hash) ?? [];
          existing.push({ path: entry.path, name: entry.name, extension: ext, sizeBytes: entry.sizeBytes });
          hashMap.set(hash, existing);
        }

        // Flush batch every BATCH_SIZE
        if (findingBatch.length >= BATCH_SIZE) {
          await flushFindings();
        }

        // Update progress every 25 files
        if (filesScanned % 25 === 0) {
          await db.update(scansTable)
            .set({ filesScanned, foldersScanned, bytesScanned, progressPercent: 50 })
            .where(eq(scansTable.id, scanId));
        }
      }
    }

    // Flush remaining findings
    await flushFindings();

    // Second pass: detect duplicates
    await db.insert(activityTable).values({
      type: "classification_complete",
      message: `Classification complete — ${filesScanned.toLocaleString()} files scanned`,
      status: "success",
    }).catch(() => {});

    const dupFindings = detectDuplicates(hashMap);
    if (dupFindings.length > 0) {
      const dupRows = dupFindings.map((f) => ({
        scanId,
        type: f.type as "duplicate",
        path: f.path,
        name: f.name,
        extension: f.extension,
        sizeBytes: f.sizeBytes,
        hash: f.hash,
        duplicateGroupHash: f.duplicateGroupHash,
        findingStatus: f.findingStatus as "duplicate",
        reason: f.reason,
      }));

      // Insert in batches
      for (let i = 0; i < dupRows.length; i += BATCH_SIZE) {
        await db.insert(findingsTable).values(dupRows.slice(i, i + BATCH_SIZE));
      }

      findings.push(...dupFindings);
    }

    const totalFindings = findings.length + dupFindings.length;
    const dupGroups = new Set(dupFindings.map((f) => f.duplicateGroupHash)).size;

    // Final scan update
    await db.update(scansTable).set({
      status: "completed",
      filesScanned,
      foldersScanned,
      bytesScanned,
      progressPercent: 100,
      completedAt: new Date(),
      findingsCount: totalFindings,
      duplicatesFound: dupGroups,
    }).where(eq(scansTable.id, scanId));

    await db.insert(activityTable).values([
      ...(dupGroups > 0 ? [{
        type: "duplicate_found" as const,
        message: `${dupGroups} duplicate group${dupGroups > 1 ? "s" : ""} detected (${dupFindings.length} files)`,
        status: "warning" as const,
      }] : []),
      {
        type: "scan_complete" as const,
        message: `Scan complete — ${filesScanned.toLocaleString()} files, ${totalFindings} findings`,
        status: "success" as const,
      },
    ]);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(scansTable).set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
      filesScanned,
      foldersScanned,
      bytesScanned,
      progressPercent: 0,
    }).where(eq(scansTable.id, scanId));

    await db.insert(activityTable).values({
      type: "error" as const,
      message: `Scan failed: ${message}`,
      status: "error" as const,
    }).catch(() => {});
  }
}
