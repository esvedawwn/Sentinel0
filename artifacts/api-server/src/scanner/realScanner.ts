import path from "path";
import {
  db,
  scansTable,
  findingsTable,
  filesTable,
  activityTable,
  scanRootsTable,
  aiClassificationsTable,
  semanticTagsTable,
  duplicateGroupsTable,
  type RiskLevel,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { walkDirectory, countChildren } from "./fileWalker.js";
import { classifyFile, classifyEmptyFolder, classifyDuplicate } from "./findingsEngine.js";
import { detectDuplicatesStaged, pickCanonical, type HashCandidate } from "./duplicateDetector.js";
import { ScanFinding, LARGE_FILE_BYTES } from "./types.js";
import { classifyWithAI } from "../ai/index.js";

const SAMPLE_LARGE_FILE_BYTES = 1024 * 1024;
const BATCH_SIZE = 50;
const PROGRESS_UPDATE_INTERVAL = 25;
const CANCEL_CHECK_INTERVAL = 100;

/**
 * Heuristic risk level for a finding — surfaced in the UI so users can
 * prioritise review. This never drives any automatic action.
 */
export function riskLevelFor(finding: Pick<ScanFinding, "type" | "findingStatus">): RiskLevel {
  if (finding.type === "zero_byte" || finding.type === "empty_folder") return "low";
  if (finding.findingStatus === "safe_delete") return "low";
  if (finding.type === "large_file") return "medium";
  if (finding.type === "duplicate") return "medium";
  if (finding.type === "installer" || finding.type === "archive") return "medium";
  if (finding.type === "locked_file" || finding.type === "idlk_file") return "high";
  return "low";
}

/** Maps a file extension to a broad display category for the Analyse page. */
function extensionToCategory(ext: string): string {
  if ([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".rtf", ".odt", ".csv", ".pages", ".numbers", ".key"].includes(ext)) return "Documents";
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".raw", ".psd", ".ai", ".eps", ".heic", ".heif"].includes(ext)) return "Images";
  if ([".mp4", ".mov", ".avi", ".mkv", ".m4v", ".wmv", ".flv", ".webm", ".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg", ".wma"].includes(ext)) return "Media";
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".cpp", ".c", ".h", ".cs", ".php", ".sh", ".bash", ".zsh", ".sql", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css", ".scss", ".less"].includes(ext)) return "Code";
  if ([".zip", ".tar", ".gz", ".bz2", ".rar", ".7z", ".xz", ".tgz"].includes(ext)) return "Archives";
  if ([".dmg", ".pkg", ".exe", ".msi", ".deb", ".rpm", ".appimage", ".snap"].includes(ext)) return "Installers";
  return "Other";
}

/** Maps a finding type to the file status shown in the Analyse view. */
function findingTypeToFileStatus(type: string): "ready" | "review" | "action_required" | "corrupted" {
  if (type === "zero_byte" || type === "empty_folder") return "corrupted";
  if (type === "idlk_file" || type === "locked_file") return "action_required";
  return "review";
}

/** Records/updates the scan root so it can be offered as a quick re-scan target. */
async function upsertScanRoot(rootPath: string): Promise<void> {
  await db
    .insert(scanRootsTable)
    .values({ path: rootPath, scanCount: 1 })
    .onConflictDoUpdate({
      target: scanRootsTable.path,
      set: { scanCount: sql`${scanRootsTable.scanCount} + 1`, lastScannedAt: new Date() },
    });
}

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
  const hashCandidates: HashCandidate[] = [];
  const findingBatch: (typeof findingsTable.$inferInsert)[] = [];
  // Parallel array of per-finding classification metadata, used to seed
  // ai_classifications/semantic_tags once we know the inserted finding ids.
  const aiMetaBatch: { provider: string; category: string; subcategory: string | null; confidence: number; explanation: string; suggestedDestination: string | null; suggestedAction: string; tags: string[] }[] = [];

  async function flushFindings() {
    if (findingBatch.length === 0) return;
    const toFlush = findingBatch.splice(0);
    const meta = aiMetaBatch.splice(0);
    const inserted = await db.insert(findingsTable).values(toFlush).returning({ id: findingsTable.id });

    const classificationRows: (typeof aiClassificationsTable.$inferInsert)[] = [];
    const tagRows: (typeof semanticTagsTable.$inferInsert)[] = [];
    inserted.forEach((row, i) => {
      const m = meta[i];
      if (!m) return;
      classificationRows.push({
        findingId: row.id,
        provider: m.provider,
        category: m.category,
        subcategory: m.subcategory,
        confidence: m.confidence,
        explanation: m.explanation,
        suggestedDestination: m.suggestedDestination,
        suggestedAction: m.suggestedAction,
      });
      for (const tag of m.tags) {
        tagRows.push({ findingId: row.id, tag });
      }
    });
    if (classificationRows.length > 0) {
      await db.insert(aiClassificationsTable).values(classificationRows);
    }
    if (tagRows.length > 0) {
      await db.insert(semanticTagsTable).values(tagRows).onConflictDoNothing();
    }
  }

  // Batch for filesTable — every walked file is indexed for the Analyse view.
  const filesBatch: (typeof filesTable.$inferInsert)[] = [];

  async function flushFiles() {
    if (filesBatch.length === 0) return;
    const toFlush = filesBatch.splice(0);
    await db.insert(filesTable).values(toFlush);
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
            riskLevel: riskLevelFor(finding),
            reason: finding.reason,
            fileCreatedAt: entry.createdAt,
            fileModifiedAt: entry.modifiedAt,
            aiCategory: aiResult.category,
            aiSubcategory: aiResult.subcategory,
            aiConfidence: aiResult.confidence,
            aiExplanation: aiResult.explanation,
            aiTags: aiResult.tags,
            aiSuggestedDestination: aiResult.suggestedDestination,
            aiSuggestedAction: aiResult.suggestedAction,
            aiProvider: aiResult.provider,
          });
          aiMetaBatch.push({
            provider: aiResult.provider,
            category: aiResult.category,
            subcategory: aiResult.subcategory,
            confidence: aiResult.confidence,
            explanation: aiResult.explanation,
            suggestedDestination: aiResult.suggestedDestination,
            suggestedAction: aiResult.suggestedAction,
            tags: aiResult.tags,
          });
        }
      } else {
        filesScanned++;
        bytesScanned += entry.sizeBytes;

        const ext = path.extname(entry.name).toLowerCase();

        const finding = classifyFile(entry.path, entry.name, entry.sizeBytes, largeFileThreshold);
        // Hoist aiResult so both the finding batch and the files batch can use it.
        let aiResult: Awaited<ReturnType<typeof classifyWithAI>> | null = null;

        if (finding) {
          typeFindings.push(finding);

          aiResult = await classifyWithAI({
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
            riskLevel: riskLevelFor(finding),
            reason: finding.reason,
            fileCreatedAt: entry.createdAt,
            fileModifiedAt: entry.modifiedAt,
            aiCategory: aiResult.category,
            aiSubcategory: aiResult.subcategory,
            aiConfidence: aiResult.confidence,
            aiExplanation: aiResult.explanation,
            aiTags: aiResult.tags,
            aiSuggestedDestination: aiResult.suggestedDestination,
            aiSuggestedAction: aiResult.suggestedAction,
            aiProvider: aiResult.provider,
          });
          aiMetaBatch.push({
            provider: aiResult.provider,
            category: aiResult.category,
            subcategory: aiResult.subcategory,
            confidence: aiResult.confidence,
            explanation: aiResult.explanation,
            suggestedDestination: aiResult.suggestedDestination,
            suggestedAction: aiResult.suggestedAction,
            tags: aiResult.tags,
          });
        }

        // Index every walked file in filesTable so the Analyse page shows a
        // full inventory regardless of whether the file triggered a finding.
        filesBatch.push({
          scanId,
          name: entry.name,
          path: entry.path,
          extension: ext,
          sizeBytes: entry.sizeBytes,
          category: aiResult ? aiResult.category : extensionToCategory(ext),
          status: finding ? findingTypeToFileStatus(finding.type) : "ready",
          tags: aiResult ? aiResult.tags : ([] as string[]),
          fileCreatedAt: entry.createdAt,
          fileModifiedAt: entry.modifiedAt,
        });

        hashCandidates.push({
          path: entry.path,
          name: entry.name,
          extension: ext,
          sizeBytes: entry.sizeBytes,
          modifiedAt: entry.modifiedAt,
        });

        if (findingBatch.length >= BATCH_SIZE) await flushFindings();
        if (filesBatch.length >= BATCH_SIZE) await flushFiles();

        if (filesScanned % PROGRESS_UPDATE_INTERVAL === 0) {
          // Estimate progress: saturates toward 85% asymptotically so the bar
          // moves meaningfully even when total file count is unknown.
          const progressEstimate = Math.min(84, Math.floor(filesScanned / (filesScanned + 500) * 85));
          await db.update(scansTable)
            .set({ filesScanned, foldersScanned, bytesScanned, progressPercent: progressEstimate })
            .where(eq(scansTable.id, scanId));
        }
      }
    }

    await flushFindings();
    await flushFiles();

    // Staged duplicate detection: size -> extension (when helpful) -> SHA-256
    // hash, with cache reuse and cooperative cancellation. See
    // duplicateDetector.ts for the pipeline itself.
    const { hashGroups, hashesComputed, hashesTotal, cancelled } = await detectDuplicatesStaged(hashCandidates, {
      signal: abortController.signal,
      cancelCheckInterval: CANCEL_CHECK_INTERVAL,
      isCancelled: async () => {
        const [check] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
        return !check || check.status === "cancelled";
      },
      onProgress: async (computed, total) => {
        if (computed % PROGRESS_UPDATE_INTERVAL !== 0 && computed !== total) return;
        const hashProgress = total > 0 ? Math.round((computed / total) * 14) : 14;
        await db.update(scansTable)
          .set({ hashesComputed: computed, hashesTotal: total, progressPercent: Math.min(85 + hashProgress, 99) })
          .where(eq(scansTable.id, scanId));
      },
    });

    if (cancelled) {
      await db.update(scansTable).set({
        status: "cancelled",
        filesScanned,
        foldersScanned,
        bytesScanned,
        hashesComputed,
        hashesTotal,
        completedAt: new Date(),
      }).where(eq(scansTable.id, scanId));
      return;
    }

    let dupFileCount = 0;
    for (const [hash, members] of hashGroups) {
      const totalSizeBytes = members.reduce((sum, m) => sum + m.sizeBytes, 0);
      const canonical = pickCanonical(members);
      const extensions = new Set(members.map((m) => m.extension));
      const explanation = extensions.size > 1
        ? `${members.length} files share identical SHA-256 content across ${extensions.size} extensions — likely renamed or re-exported copies`
        : `${members.length} files share identical SHA-256 content (${members[0]?.extension || "no extension"})`;

      const [group] = await db.insert(duplicateGroupsTable).values({
        scanId,
        hash,
        status: "pending",
        totalSizeBytes,
        savedBytes: 0,
        confidence: 1,
        explanation,
      }).returning();

      const dupRows: (typeof findingsTable.$inferInsert)[] = [];
      const dupMeta: typeof aiMetaBatch = [];

      for (const member of members) {
        const finding = classifyDuplicate(member.path, member.name, member.extension, member.sizeBytes, hash);
        const aiResult = await classifyWithAI({
          path: finding.path,
          name: finding.name,
          extension: finding.extension,
          sizeBytes: finding.sizeBytes,
          findingType: finding.type,
        });

        dupRows.push({
          scanId,
          type: finding.type,
          path: finding.path,
          name: finding.name,
          extension: finding.extension,
          sizeBytes: finding.sizeBytes,
          hash: finding.hash,
          duplicateGroupHash: finding.duplicateGroupHash,
          duplicateGroupId: group.id,
          findingStatus: finding.findingStatus,
          riskLevel: riskLevelFor(finding),
          reason: finding.reason,
          fileModifiedAt: member.modifiedAt,
          aiCategory: aiResult.category,
          aiSubcategory: aiResult.subcategory,
          aiConfidence: aiResult.confidence,
          aiExplanation: aiResult.explanation,
          aiTags: aiResult.tags,
          aiSuggestedDestination: aiResult.suggestedDestination,
          aiSuggestedAction: aiResult.suggestedAction,
          aiProvider: aiResult.provider,
        });
        dupMeta.push({
          provider: aiResult.provider,
          category: aiResult.category,
          subcategory: aiResult.subcategory,
          confidence: aiResult.confidence,
          explanation: aiResult.explanation,
          suggestedDestination: aiResult.suggestedDestination,
          suggestedAction: aiResult.suggestedAction,
          tags: aiResult.tags,
        });
      }

      const inserted = await db.insert(findingsTable).values(dupRows).returning({ id: findingsTable.id, path: findingsTable.path });

      const classificationRows: (typeof aiClassificationsTable.$inferInsert)[] = [];
      const tagRows: (typeof semanticTagsTable.$inferInsert)[] = [];
      let canonicalFindingId: number | null = null;
      inserted.forEach((row, idx) => {
        if (row.path === canonical.path) canonicalFindingId = row.id;
        const m = dupMeta[idx];
        if (!m) return;
        classificationRows.push({
          findingId: row.id,
          provider: m.provider,
          category: m.category,
          subcategory: m.subcategory,
          confidence: m.confidence,
          explanation: m.explanation,
          suggestedDestination: m.suggestedDestination,
          suggestedAction: m.suggestedAction,
        });
        for (const tag of m.tags) tagRows.push({ findingId: row.id, tag });
      });
      if (classificationRows.length > 0) await db.insert(aiClassificationsTable).values(classificationRows);
      if (tagRows.length > 0) await db.insert(semanticTagsTable).values(tagRows).onConflictDoNothing();

      if (canonicalFindingId !== null) {
        await db.update(duplicateGroupsTable).set({ canonicalFindingId }).where(eq(duplicateGroupsTable.id, group.id));
      }

      dupFileCount += members.length;
    }

    await upsertScanRoot(rootPath);

    const dupGroups = hashGroups.size;
    const totalFindings = typeFindings.length + dupFileCount;

    await db.update(scansTable).set({
      status: "completed",
      filesScanned,
      foldersScanned,
      bytesScanned,
      progressPercent: 100,
      completedAt: new Date(),
      findingsCount: totalFindings,
      duplicatesFound: dupGroups,
      hashesComputed,
      hashesTotal,
    }).where(eq(scansTable.id, scanId));

    await db.insert(activityTable).values([
      {
        scanId,
        type: "classification_complete" as const,
        message: `Classification complete — ${filesScanned.toLocaleString()} files scanned`,
        status: "success" as const,
      },
      ...(dupGroups > 0 ? [{
        scanId,
        type: "duplicate_found" as const,
        message: `${dupGroups} duplicate group${dupGroups > 1 ? "s" : ""} detected (${dupFileCount} files)`,
        status: "warning" as const,
      }] : []),
      {
        scanId,
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
