/**
 * Seeds the Sentinel database with representative demo data: a handful of
 * completed scans, findings across all types/statuses, duplicate groups,
 * AI classifications, semantic tags, and activity events.
 *
 * Never touches file contents or secrets — this is structural metadata only.
 *
 * Usage: pnpm --filter @workspace/scripts run seed
 */
import {
  db,
  scansTable,
  findingsTable,
  scanRootsTable,
  aiClassificationsTable,
  semanticTagsTable,
  activityTable,
  duplicateGroupsTable,
  duplicateGroupFilesTable,
  filesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding Sentinel database with demo scan history…");

  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  const [rootA] = await db
    .insert(scanRootsTable)
    .values({ path: "/home/runner/workspace/sample-data", label: "Sample Data", scanCount: 3, lastScannedAt: daysAgo(0) })
    .onConflictDoUpdate({
      target: scanRootsTable.path,
      set: { scanCount: 3, lastScannedAt: daysAgo(0) },
    })
    .returning();

  const scanSeeds = [
    { path: rootA.path, startedDaysAgo: 6, files: 128, folders: 14, bytes: 512_000_000, findings: 22 },
    { path: rootA.path, startedDaysAgo: 3, files: 140, folders: 15, bytes: 540_000_000, findings: 17 },
    { path: rootA.path, startedDaysAgo: 0, files: 152, folders: 16, bytes: 561_000_000, findings: 12 },
  ];

  for (const s of scanSeeds) {
    const startedAt = daysAgo(s.startedDaysAgo);
    const completedAt = new Date(startedAt.getTime() + 45_000);

    const [scan] = await db
      .insert(scansTable)
      .values({
        path: s.path,
        mode: "sample",
        status: "completed",
        filesScanned: s.files,
        foldersScanned: s.folders,
        bytesScanned: s.bytes,
        filesTotal: s.files,
        findingsCount: s.findings,
        duplicatesFound: 2,
        corruptedFound: 1,
        startedAt,
        completedAt,
      })
      .returning();

    const findingSeeds: Array<{
      type: "empty_folder" | "zero_byte" | "idlk_file" | "locked_file" | "installer" | "archive" | "large_file" | "duplicate";
      status: "safe_delete" | "review" | "duplicate" | "ignored";
      risk: "low" | "medium" | "high";
      name: string;
      ext: string;
      size: number;
      category: string | null;
    }> = [
      { type: "empty_folder", status: "safe_delete", risk: "low", name: "old-drafts", ext: "", size: 0, category: null },
      { type: "zero_byte", status: "safe_delete", risk: "low", name: "placeholder.txt", ext: ".txt", size: 0, category: "Temporary Files" },
      { type: "large_file", status: "review", risk: "medium", name: "vacation-video.mov", ext: ".mov", size: 250_000_000, category: "Video" },
      { type: "installer", status: "review", risk: "medium", name: "setup.exe", ext: ".exe", size: 45_000_000, category: "Installers" },
      { type: "archive", status: "review", risk: "medium", name: "backup-2023.zip", ext: ".zip", size: 80_000_000, category: "Archives" },
      { type: "idlk_file", status: "review", risk: "high", name: "budget.xlsx.idlk", ext: ".idlk", size: 1024, category: "Lock Files" },
    ];

    for (const f of findingSeeds) {
      const [finding] = await db
        .insert(findingsTable)
        .values({
          scanId: scan.id,
          type: f.type,
          path: `${s.path}/${f.name}`,
          name: f.name,
          extension: f.ext,
          sizeBytes: f.size,
          findingStatus: f.status,
          riskLevel: f.risk,
          reason: `Detected via ${f.type} heuristic during scan`,
          fileCreatedAt: daysAgo(s.startedDaysAgo + 30),
          fileModifiedAt: daysAgo(s.startedDaysAgo + 1),
        })
        .returning();

      if (f.category) {
        const [classification] = await db
          .insert(aiClassificationsTable)
          .values({
            findingId: finding.id,
            provider: "local-rule",
            category: f.category,
            subcategory: null,
            confidence: 72,
            explanation: `Classified as ${f.category} based on filename/extension heuristics.`,
            suggestedDestination: `/Organised/${f.category}`,
            suggestedAction: f.status === "safe_delete" ? "delete" : "review",
          })
          .returning();

        await db
          .update(findingsTable)
          .set({
            aiCategory: f.category,
            aiConfidence: 72,
            aiExplanation: classification.explanation,
            aiSuggestedDestination: classification.suggestedDestination,
            aiSuggestedAction: classification.suggestedAction,
            aiProvider: "local-rule",
            aiTags: [f.type, f.category.toLowerCase()],
          })
          .where(eq(findingsTable.id, finding.id));

        await db.insert(semanticTagsTable).values([
          { findingId: finding.id, tag: f.type },
          { findingId: finding.id, tag: f.category.toLowerCase() },
        ]);
      }
    }

    // Duplicate group: two files sharing a hash.
    const hash = `demo-hash-${scan.id}`;
    const [dupFileA] = await db
      .insert(findingsTable)
      .values({
        scanId: scan.id,
        type: "duplicate",
        path: `${s.path}/photos/img_001.jpg`,
        name: "img_001.jpg",
        extension: ".jpg",
        sizeBytes: 4_200_000,
        hash,
        duplicateGroupHash: hash,
        findingStatus: "duplicate",
        riskLevel: "medium",
        reason: "Duplicate of img_001_copy.jpg",
      })
      .returning();

    const [dupFileB] = await db
      .insert(findingsTable)
      .values({
        scanId: scan.id,
        type: "duplicate",
        path: `${s.path}/photos/img_001_copy.jpg`,
        name: "img_001_copy.jpg",
        extension: ".jpg",
        sizeBytes: 4_200_000,
        hash,
        duplicateGroupHash: hash,
        findingStatus: "duplicate",
        riskLevel: "medium",
        reason: "Duplicate of img_001.jpg",
      })
      .returning();

    const [fileA] = await db
      .insert(filesTable)
      .values({
        scanId: scan.id,
        path: dupFileA.path,
        name: dupFileA.name,
        extension: dupFileA.extension,
        sizeBytes: dupFileA.sizeBytes,
        category: "Photography",
        status: "review",
      })
      .returning();

    const [fileB] = await db
      .insert(filesTable)
      .values({
        scanId: scan.id,
        path: dupFileB.path,
        name: dupFileB.name,
        extension: dupFileB.extension,
        sizeBytes: dupFileB.sizeBytes,
        category: "Photography",
        status: "review",
      })
      .returning();

    const [group] = await db
      .insert(duplicateGroupsTable)
      .values({
        scanId: scan.id,
        status: "pending",
        totalSizeBytes: dupFileA.sizeBytes * 2,
        savedBytes: dupFileA.sizeBytes,
      })
      .returning();

    await db.insert(duplicateGroupFilesTable).values([
      { groupId: group.id, fileId: fileA.id },
      { groupId: group.id, fileId: fileB.id },
    ]);

    await db.insert(activityTable).values([
      { scanId: scan.id, type: "scan_complete", message: `Scan completed: ${s.files} files, ${s.findings} findings`, status: "success", timestamp: completedAt },
      { scanId: scan.id, type: "duplicate_found", message: "Duplicate group detected: img_001.jpg", status: "info", timestamp: completedAt },
    ]);
  }

  console.log(`Seeded ${scanSeeds.length} scans with findings, duplicates, AI classifications, and activity.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
