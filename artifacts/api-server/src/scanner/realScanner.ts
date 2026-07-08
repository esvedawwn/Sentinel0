import path from "path";
import { db, scansTable, findingsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { walkDirectory, computeHash, countChildren } from "./fileWalker.js";
import { classifyFile, classifyEmptyFolder, detectDuplicates } from "./findingsEngine.js";
import { ScanFinding, LARGE_FILE_BYTES } from "./types.js";
import { classifyWithAI } from "../ai/index.js";

const SAMPLE_LARGE_FILE_BYTES = 1024 * 1024;
const BATCH_SIZE = 50;
const PROGRESS_UPDATE_INTERVAL = 25;
const CANCEL_CHECK_INTERVAL = 100;

/**
 * Run a real filesystem scan against the given path.
 * Walks files, classifies findings, hashes files for dedup,
 * and enriches each finding with AI classification metadata.
 * Updates scan progress in the DB and fires activity events.
 */
export async function runRealScan(
  scanId: number,
  rootPath: string,
  isSample: boolean
): Promise<void> {
  const largeFileThreshold = isSample ? SAMPLE_LARGE_FILE_BYTES : LARGE_FILE_BYTES;
  const abortController = new AbortController();

  let filesScanned = 0;
  let foldersScanned = 0;
  let bytesScanned = 0;
  const typeFindings: ScanFinding[] = [];
  const hashMap = new Map<string, Array<{ path: string; name: string; extension: string; sizeBytes: number }>>();
  const findingBatch: (typeof findingsTable.$inferInsert)[] = [];

  async function flushFindings() {
    if (findingBatch.length === 0) return;
    const toFlush = findingBatch.splice(0);
    await db.insert(findingsTable).values(toFlush);
  }

  try {
    const [current] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!current || current.status === "cancelled") return;

    for await (const entry of walkDirectory(rootPath, abortController.signal)) {
      const totalSeen = filesScanned + foldersScanned;

      if (totalSeen % CANCEL_CHECK_INTERVAL === 0 && totalSeen > 0) {
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
          typeFindings.push(finding);

          // AI classification for empty folder findings
          const aiResult = await classifyWithAI({
            path: finding.path,
            name: finding.name,
            extension: finding.extension,
            sizeBytes: finding.sizeBytes,
            findingType: finding.type,
          });

          findingBatch.push({
            scanId,
            type: finding.type,
            path: finding.path,
            name: finding.name,
            extension: finding.extension,
            sizeBytes: finding.sizeBytes,
            findingStatus: finding.findingStatus,
            reason: finding.reason,
            aiCategory: aiResult.category,
            aiConfidence: aiResult.confidence,
            aiExplanation: aiResult.explanation,
            aiTags: aiResult.tags,
            aiProvider: aiResult.provider,
          });
        }
      } else {
        filesScanned++;
        bytesScanned += entry.sizeBytes;

        const ext = path.extname(entry.name).toLowerCase();

        const finding = classifyFile(entry.path, entry.name, entry.sizeBytes, largeFileThreshold);
        if (finding) {
          typeFindings.push(finding);

          // AI classification for file findings
          const aiResult = await classifyWithAI({
            path: finding.path,
            name: finding.name,
            extension: finding.extension,
            sizeBytes: finding.sizeBytes,
            findingType: finding.type,
          });

          findingBatch.push({
            scanId,
            type: finding.type,
            path: finding.path,
            name: finding.name,
            extension: finding.extension,
            sizeBytes: finding.sizeBytes,
            findingStatus: finding.findingStatus,
            reason: finding.reason,
            aiCategory: aiResult.category,
            aiConfidence: aiResult.confidence,
            aiExplanation: aiResult.explanation,
            aiTags: aiResult.tags,
            aiProvider: aiResult.provider,
          });
        }

        const hash = await computeHash(entry.path, entry.sizeBytes);
        if (hash) {
          const existing = hashMap.get(hash) ?? [];
          existing.push({ path: entry.path, name: entry.name, extension: ext, sizeBytes: entry.sizeBytes });
          hashMap.set(hash, existing);
        }

        if (findingBatch.length >= BATCH_SIZE) {
          await flushFindings();
        }

        if (filesScanned % PROGRESS_UPDATE_INTERVAL === 0) {
          const progressEstimate = Math.min(85, Math.round((bytesScanned / Math.max(bytesScanned, 1)) * 50) + Math.floor(filesScanned / 10));
          await db.update(scansTable)
            .set({ filesScanned, foldersScanned, bytesScanned, progressPercent: Math.min(progressEstimate, 85) })
            .where(eq(scansTable.id, scanId));
        }
      }
    }

    await flushFindings();

    // Dedup pass — AI classify duplicate findings too
    const dupFindings = detectDuplicates(hashMap);

    if (dupFindings.length > 0) {
      const dupRows: (typeof findingsTable.$inferInsert)[] = [];

      for (const f of dupFindings) {
        const aiResult = await classifyWithAI({
          path: f.path,
          name: f.name,
          extension: f.extension,
          sizeBytes: f.sizeBytes,
          findingType: f.type,
        });

        dupRows.push({
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
          aiCategory: aiResult.category,
          aiConfidence: aiResult.confidence,
          aiExplanation: aiResult.explanation,
          aiTags: aiResult.tags,
          aiProvider: aiResult.provider,
        });
      }

      for (let i = 0; i < dupRows.length; i += BATCH_SIZE) {
        await db.insert(findingsTable).values(dupRows.slice(i, i + BATCH_SIZE));
      }
    }

    const totalFindings = typeFindings.length + dupFindings.length;
    const dupGroups = new Set(dupFindings.map((f) => f.duplicateGroupHash)).size;

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
      {
        type: "classification_complete" as const,
        message: `Classification complete — ${filesScanned.toLocaleString()} files scanned`,
        status: "success" as const,
      },
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
