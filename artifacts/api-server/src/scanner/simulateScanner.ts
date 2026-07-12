import {
  db,
  scansTable,
  filesTable,
  findingsTable,
  duplicateGroupsTable,
  aiClassificationsTable,
  semanticTagsTable,
  activityTable,
  scanRootsTable,
  type FindingType,
  type FindingStatus,
  type RiskLevel,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { classifyWithAI } from "../ai/index.js";

// ── Demo data config ──────────────────────────────────────────────────────────

const DEMO_DIRS = [
  "Documents/Banking",
  "Documents/Legal",
  "Documents/Reports",
  "Documents/Contracts",
  "Design/Logos",
  "Design/Exports",
  "Design/Working",
  "Projects/Web",
  "Projects/Mobile",
  "Projects/Archive",
  "Downloads",
  "Media/Photos",
  "Media/Videos",
  "Media/Audio",
  "Temp",
];

interface ExtSpec {
  ext: string;
  category: string;
  minSize: number;
  maxSize: number;
  names: readonly string[];
}

const DEMO_EXTS: ExtSpec[] = [
  { ext: ".pdf",  category: "Documents", minSize: 50_000,      maxSize: 15_000_000,    names: ["statement", "invoice", "contract", "report", "agreement", "proposal", "receipt", "letter"] },
  { ext: ".docx", category: "Documents", minSize: 20_000,      maxSize: 5_000_000,     names: ["draft", "report", "notes", "minutes", "letter", "summary", "memo", "brief"] },
  { ext: ".xlsx", category: "Documents", minSize: 10_000,      maxSize: 3_000_000,     names: ["budget", "tracker", "schedule", "analysis", "forecast", "expenses", "data"] },
  { ext: ".txt",  category: "Documents", minSize: 500,         maxSize: 500_000,       names: ["notes", "readme", "log", "todo", "changelog", "scratch"] },
  { ext: ".md",   category: "Documents", minSize: 500,         maxSize: 100_000,       names: ["readme", "guide", "docs", "notes", "spec", "api"] },
  { ext: ".jpg",  category: "Images",    minSize: 500_000,     maxSize: 8_000_000,     names: ["photo", "scan", "image", "picture", "export", "render", "preview"] },
  { ext: ".png",  category: "Images",    minSize: 200_000,     maxSize: 15_000_000,    names: ["screenshot", "export", "graphic", "logo", "icon", "banner", "thumbnail"] },
  { ext: ".psd",  category: "Images",    minSize: 5_000_000,   maxSize: 150_000_000,   names: ["design", "mockup", "template", "artwork", "poster", "layout", "comp"] },
  { ext: ".ai",   category: "Images",    minSize: 500_000,     maxSize: 50_000_000,    names: ["logo", "vector", "artwork", "design", "illustration", "icon", "badge"] },
  { ext: ".mp4",  category: "Media",     minSize: 50_000_000,  maxSize: 800_000_000,   names: ["recording", "screen", "tutorial", "export", "footage", "clip"] },
  { ext: ".mp3",  category: "Media",     minSize: 3_000_000,   maxSize: 30_000_000,    names: ["recording", "audio", "podcast", "interview", "ambient", "track"] },
  { ext: ".mov",  category: "Media",     minSize: 100_000_000, maxSize: 2_000_000_000, names: ["raw", "footage", "clip", "export", "recording", "screencap"] },
  { ext: ".ts",   category: "Code",      minSize: 500,         maxSize: 100_000,       names: ["index", "utils", "types", "config", "router", "service", "model", "api"] },
  { ext: ".js",   category: "Code",      minSize: 1_000,       maxSize: 500_000,       names: ["bundle", "min", "config", "webpack", "babel", "rollup", "esbuild"] },
  { ext: ".py",   category: "Code",      minSize: 500,         maxSize: 50_000,        names: ["script", "utils", "main", "config", "migrate", "seed"] },
  { ext: ".json", category: "Code",      minSize: 200,         maxSize: 500_000,       names: ["package", "tsconfig", "config", "manifest", "data", "schema"] },
  { ext: ".zip",  category: "Archives",  minSize: 1_000_000,   maxSize: 500_000_000,   names: ["backup", "archive", "export", "bundle", "release", "snapshot"] },
  { ext: ".log",  category: "Other",     minSize: 10_000,      maxSize: 50_000_000,    names: ["app", "error", "system", "debug", "server", "access", "crash"] },
  { ext: ".bak",  category: "Other",     minSize: 100_000,     maxSize: 10_000_000,    names: ["backup", "old", "archive", "copy", "prev"] },
  { ext: ".tmp",  category: "Other",     minSize: 0,           maxSize: 1_000_000,     names: ["temp", "cache", "draft", "work", "build"] },
];

// ── Type finding templates ────────────────────────────────────────────────────

interface FindingTemplate {
  type: FindingType;
  name: string;
  ext: string;
  dir: string;
  sizeBytes: number;
  findingStatus: FindingStatus;
  reason: string;
}

const TYPE_FINDINGS: FindingTemplate[] = [
  // zero_byte — likely safe to delete
  { type: "zero_byte", name: "temp_cache_a.tmp",        ext: ".tmp",  dir: "Temp",                  sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte file — likely a failed download or incomplete write." },
  { type: "zero_byte", name: "temp_cache_b.tmp",        ext: ".tmp",  dir: "Temp",                  sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte file — likely a failed download or incomplete write." },
  { type: "zero_byte", name: "cache_manifest.json",     ext: ".json", dir: "Temp",                  sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte JSON — serialisation interrupted before any bytes were written." },
  { type: "zero_byte", name: "build_output.log",        ext: ".log",  dir: "Temp",                  sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte log — process exited before writing any output." },
  { type: "zero_byte", name: "render_failed.png",       ext: ".png",  dir: "Design/Exports",        sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte PNG — export task failed before writing file contents." },
  // zero_byte — corrupted documents
  { type: "zero_byte", name: "corrupted_export.pdf",    ext: ".pdf",  dir: "Documents/Reports",     sizeBytes: 0, findingStatus: "review",      reason: "Zero-byte PDF — file was created but never written; likely a failed export." },
  { type: "zero_byte", name: "empty_spreadsheet.xlsx",  ext: ".xlsx", dir: "Documents/Banking",     sizeBytes: 0, findingStatus: "review",      reason: "Zero-byte spreadsheet — the file header was not written; data may be lost." },
  { type: "zero_byte", name: "blank_contract.docx",     ext: ".docx", dir: "Documents/Legal",       sizeBytes: 0, findingStatus: "review",      reason: "Zero-byte DOCX — re-open from autosave if available; document content is missing." },
  { type: "zero_byte", name: "failed_render.jpg",       ext: ".jpg",  dir: "Design/Exports",        sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte image — rendering process did not complete." },
  { type: "zero_byte", name: "missing_attachment.pdf",  ext: ".pdf",  dir: "Downloads",             sizeBytes: 0, findingStatus: "safe_delete", reason: "Zero-byte PDF — attachment saved without content; original may be available elsewhere." },
  // large_file
  { type: "large_file", name: "raw_footage_q1.mov",     ext: ".mov",  dir: "Media/Videos",          sizeBytes: 4_831_838_208, findingStatus: "review", reason: "File exceeds 2 GB — review whether a compressed version exists." },
  { type: "large_file", name: "annual_backup.zip",      ext: ".zip",  dir: "Downloads",             sizeBytes: 6_442_450_944, findingStatus: "review", reason: "Archive exceeds 6 GB — consider removing if contents are archived elsewhere." },
  { type: "large_file", name: "design_assets.psd",      ext: ".psd",  dir: "Design/Working",        sizeBytes: 987_654_321,  findingStatus: "review",  reason: "Flattened PSD exceeds 950 MB — check whether all layers are still needed." },
  { type: "large_file", name: "dataset_export.csv",     ext: ".csv",  dir: "Projects/Web",          sizeBytes: 524_288_000,  findingStatus: "review",  reason: "CSV exceeds 500 MB — consider sampling or archiving historical rows." },
  { type: "large_file", name: "screen_recording.mp4",   ext: ".mp4",  dir: "Media/Videos",          sizeBytes: 2_147_483_648, findingStatus: "review", reason: "Screen recording exceeds 2 GB — review whether this is still needed." },
  // archive
  { type: "archive", name: "project_backup_2022.zip",   ext: ".zip",  dir: "Downloads",             sizeBytes: 1_234_567_890, findingStatus: "review", reason: "Compressed archive — verify contents are duplicated elsewhere before removing." },
  { type: "archive", name: "exports_march_2023.zip",    ext: ".zip",  dir: "Downloads",             sizeBytes: 345_678_901,  findingStatus: "review",  reason: "Compressed archive from 2023 — candidate for cold storage." },
  { type: "archive", name: "dependencies_snapshot.tar", ext: ".tar",  dir: "Projects/Archive",      sizeBytes: 2_345_678_901, findingStatus: "review", reason: "Uncompressed tarball — likely a node_modules snapshot; safe to regenerate." },
  { type: "archive", name: "database_dump.tar.gz",      ext: ".gz",   dir: "Projects/Archive",      sizeBytes: 567_890_123,  findingStatus: "review",  reason: "Compressed database dump — confirm a more recent backup exists first." },
  { type: "archive", name: "old_site_backup.rar",       ext: ".rar",  dir: "Downloads",             sizeBytes: 890_123_456,  findingStatus: "review",  reason: "RAR archive — check whether this is the canonical backup copy." },
  // installer
  { type: "installer", name: "Adobe_CC_2024.dmg",       ext: ".dmg",  dir: "Downloads",             sizeBytes: 3_221_225_472, findingStatus: "review", reason: "macOS disk image — safe to delete once software is installed." },
  { type: "installer", name: "Xcode_15.pkg",            ext: ".pkg",  dir: "Downloads",             sizeBytes: 7_516_192_768, findingStatus: "review", reason: "macOS package installer — safe to remove after installation." },
  { type: "installer", name: "CLtools_setup.exe",       ext: ".exe",  dir: "Downloads",             sizeBytes: 234_567_890,  findingStatus: "review",  reason: "Windows installer — safe to remove after installation." },
  { type: "installer", name: "fonts_pack_2024.pkg",     ext: ".pkg",  dir: "Downloads",             sizeBytes: 456_789_012,  findingStatus: "review",  reason: "Package installer — safe to delete once contents are installed." },
  { type: "installer", name: "VirtualBox-7.pkg",        ext: ".pkg",  dir: "Downloads",             sizeBytes: 1_073_741_824, findingStatus: "review", reason: "Package installer — large installer safe to remove after setup." },
  // idlk_file (InDesign locks)
  { type: "idlk_file", name: "annual_report.idlk",      ext: ".idlk", dir: "Design/Working",        sizeBytes: 0, findingStatus: "review", reason: "InDesign lock (.idlk) — remove to release the document lock." },
  { type: "idlk_file", name: "brochure_2024.idlk",      ext: ".idlk", dir: "Design/Working",        sizeBytes: 0, findingStatus: "review", reason: "InDesign lock (.idlk) — indicates InDesign was not closed cleanly." },
  { type: "idlk_file", name: "product_catalog.idlk",    ext: ".idlk", dir: "Design/Exports",        sizeBytes: 0, findingStatus: "review", reason: "InDesign lock (.idlk) — safe to delete once InDesign is closed." },
  { type: "idlk_file", name: "newsletter_q4.idlk",      ext: ".idlk", dir: "Design/Working",        sizeBytes: 0, findingStatus: "review", reason: "InDesign lock (.idlk) — application may have crashed without releasing the lock." },
  { type: "idlk_file", name: "magazine_cover.idlk",     ext: ".idlk", dir: "Design/Exports",        sizeBytes: 0, findingStatus: "review", reason: "InDesign lock (.idlk) — remove once it is confirmed InDesign is not running." },
];

// ── Duplicate group templates ─────────────────────────────────────────────────

interface DupGroupTemplate {
  hash: string;
  explanation: string;
  members: Array<{ name: string; ext: string; dir: string; sizeBytes: number }>;
}

const DUP_GROUPS: DupGroupTemplate[] = [
  {
    hash: "a3f8c2e1d4b6f9a7c0e3d5b8f1a2c4e7d9b0f3a5c8e2d4b7f0a1c3e6d8b9f2a4",
    explanation: "4 PDF files share identical SHA-256 content — likely renamed or re-exported copies of the same source document.",
    members: [
      { name: "logo_guidelines_v1.pdf",     ext: ".pdf", dir: "Design/Logos",         sizeBytes: 4_194_304 },
      { name: "logo_guidelines_final.pdf",  ext: ".pdf", dir: "Design/Exports",       sizeBytes: 4_194_304 },
      { name: "logo_guidelines_backup.pdf", ext: ".pdf", dir: "Downloads",            sizeBytes: 4_194_304 },
      { name: "brand_guidelines.pdf",       ext: ".pdf", dir: "Documents/Contracts",  sizeBytes: 4_194_304 },
    ],
  },
  {
    hash: "b7d3e5f2a8c1e4d6b9f0a2c4e7d1b3f5a0c2e4d6b8f0a3c5e7d2b4f6a1c3e5",
    explanation: "3 JPG files share identical SHA-256 content — same photo re-saved under different names.",
    members: [
      { name: "headshot_2024.jpg",   ext: ".jpg", dir: "Media/Photos", sizeBytes: 3_145_728 },
      { name: "profile_photo.jpg",   ext: ".jpg", dir: "Media/Photos", sizeBytes: 3_145_728 },
      { name: "profile_backup.jpg",  ext: ".jpg", dir: "Downloads",    sizeBytes: 3_145_728 },
    ],
  },
  {
    hash: "c4e6a8d0b2f4a7c1e3d5b7f9a1c3e5d7b9f1a3c5e7d9b1f3a5c7e9d0b2f4a6",
    explanation: "3 DOCX files share identical SHA-256 content — same template saved in multiple locations.",
    members: [
      { name: "nda_template.docx",       ext: ".docx", dir: "Documents/Legal",     sizeBytes: 1_048_576 },
      { name: "nda_template_copy.docx",  ext: ".docx", dir: "Documents/Contracts", sizeBytes: 1_048_576 },
      { name: "nda_standard_2024.docx",  ext: ".docx", dir: "Downloads",           sizeBytes: 1_048_576 },
    ],
  },
  {
    hash: "d1f3b5e7c9a2d4f6b8e0a3c5e7d9f1b3a5c7e9d0b2f4a6c8e1d3b5f7a9c2e4",
    explanation: "4 PSD files share identical SHA-256 content — design file duplicated without modification.",
    members: [
      { name: "homepage_mockup_v1.psd",    ext: ".psd", dir: "Design/Working",  sizeBytes: 52_428_800 },
      { name: "homepage_mockup_final.psd", ext: ".psd", dir: "Design/Exports",  sizeBytes: 52_428_800 },
      { name: "homepage_v2.psd",           ext: ".psd", dir: "Design/Working",  sizeBytes: 52_428_800 },
      { name: "homepage_archived.psd",     ext: ".psd", dir: "Downloads",       sizeBytes: 52_428_800 },
    ],
  },
  {
    hash: "e8a0c2d4f6b8e1a3c5d7f9b1e3a5c7d9f2b4a6c8e0d2f4b6a9c1e3d5f7b9a2",
    explanation: "3 ZIP archives share identical SHA-256 content — same backup bundle in multiple locations.",
    members: [
      { name: "project_backup_v3.zip",   ext: ".zip", dir: "Downloads",         sizeBytes: 134_217_728 },
      { name: "project_backup_copy.zip", ext: ".zip", dir: "Projects/Archive",  sizeBytes: 134_217_728 },
      { name: "project_final.zip",       ext: ".zip", dir: "Documents/Reports", sizeBytes: 134_217_728 },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length] as T;
}

function riskForType(type: string, findingStatus: string): "low" | "medium" | "high" | "critical" {
  if (type === "zero_byte" || type === "empty_folder") return "low";
  if (findingStatus === "safe_delete") return "low";
  if (type === "large_file" || type === "duplicate" || type === "archive" || type === "installer") return "medium";
  if (type === "locked_file" || type === "idlk_file") return "high";
  return "low";
}

function fileStatusForFindingType(type: string): "ready" | "review" | "action_required" | "corrupted" {
  if (type === "zero_byte") return "corrupted";
  if (type === "idlk_file" || type === "locked_file") return "action_required";
  return "review";
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Demo scan: generates realistic, complete data across ALL persistence tables.
 * Produces 400 file records, 30 type findings, and 5 duplicate groups (17 members).
 * Everything is written to SQLite — no in-memory-only state.
 *
 * Used when the requested path does not exist on the real filesystem.
 * The scan runs over ~12 seconds in 10 steps to simulate realistic progress.
 */
export async function simulateScan(scanId: number, scanPath: string): Promise<void> {
  const FILES_PER_BATCH = 50;
  const FILE_BATCHES = 8;
  const TOTAL_FILES = FILES_PER_BATCH * FILE_BATCHES; // 400
  const STEP_MS = 1200;

  try {
    // ── Pre-flight ──────────────────────────────────────────────────────────
    const [initial] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!initial || initial.status === "cancelled") return;

    await db.update(scansTable).set({ filesTotal: TOTAL_FILES }).where(eq(scansTable.id, scanId));

    // ── Phase 1: File records (8 × 50 = 400 files) ─────────────────────────
    for (let step = 0; step < FILE_BATCHES; step++) {
      await new Promise<void>((resolve) => setTimeout(resolve, STEP_MS));

      const [check] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
      if (!check || check.status === "cancelled") return;

      const fileRows: (typeof filesTable.$inferInsert)[] = [];

      for (let i = 0; i < FILES_PER_BATCH; i++) {
        const fileIndex = step * FILES_PER_BATCH + i;
        const spec = pick(DEMO_EXTS, fileIndex);
        const dir = pick(DEMO_DIRS, fileIndex + step * 3);
        const baseName = pick(spec.names, fileIndex + step);
        const name = `${baseName}_${String(fileIndex + 1).padStart(3, "0")}${spec.ext}`;
        // Deterministic size: cycle through the min→max range in 20 steps
        const fraction = (fileIndex % 20) / 20;
        const sizeBytes = Math.floor(spec.minSize + fraction * (spec.maxSize - spec.minSize));

        // Spread statuses realistically
        let status: "ready" | "review" | "action_required" | "corrupted" = "ready";
        if (fileIndex % 12 === 0) status = "review";
        if (fileIndex % 25 === 0) status = "action_required";
        if (fileIndex % 60 === 0) status = "corrupted";

        fileRows.push({
          scanId,
          name,
          path: `${scanPath}/${dir}/${name}`,
          extension: spec.ext,
          sizeBytes,
          category: spec.category,
          status,
          tags: [spec.category.toLowerCase()],
        });
      }

      await db.insert(filesTable).values(fileRows);

      const filesScanned = (step + 1) * FILES_PER_BATCH;
      const progress = Math.floor(((step + 1) / (FILE_BATCHES + 2)) * 80);
      await db.update(scansTable)
        .set({ filesScanned, progressPercent: progress })
        .where(eq(scansTable.id, scanId));
    }

    // ── Phase 2: Type findings + AI classifications ─────────────────────────
    await new Promise<void>((resolve) => setTimeout(resolve, STEP_MS));

    const [check2] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!check2 || check2.status === "cancelled") return;

    await db.update(scansTable).set({ progressPercent: 85 }).where(eq(scansTable.id, scanId));

    for (const tmpl of TYPE_FINDINGS) {
      const fullPath = `${scanPath}/${tmpl.dir}/${tmpl.name}`;
      const aiResult = await classifyWithAI({
        path: fullPath,
        name: tmpl.name,
        extension: tmpl.ext,
        sizeBytes: tmpl.sizeBytes,
        findingType: tmpl.type,
      });

      const [inserted] = await db
        .insert(findingsTable)
        .values({
          scanId,
          type: tmpl.type,
          path: fullPath,
          name: tmpl.name,
          extension: tmpl.ext,
          sizeBytes: tmpl.sizeBytes,
          findingStatus: tmpl.findingStatus,
          riskLevel: riskForType(tmpl.type, tmpl.findingStatus),
          reason: tmpl.reason,
          aiCategory: aiResult.category,
          aiSubcategory: aiResult.subcategory,
          aiConfidence: aiResult.confidence,
          aiExplanation: aiResult.explanation,
          aiTags: aiResult.tags,
          aiSuggestedDestination: aiResult.suggestedDestination,
          aiSuggestedAction: aiResult.suggestedAction,
          aiProvider: aiResult.provider,
        })
        .returning();

      if (inserted) {
        await db.insert(aiClassificationsTable).values({
          findingId: inserted.id,
          provider: aiResult.provider,
          category: aiResult.category,
          subcategory: aiResult.subcategory,
          confidence: aiResult.confidence,
          explanation: aiResult.explanation,
          suggestedDestination: aiResult.suggestedDestination,
          suggestedAction: aiResult.suggestedAction,
        });

        if (aiResult.tags.length > 0) {
          await db
            .insert(semanticTagsTable)
            .values(aiResult.tags.map((tag) => ({ findingId: inserted.id, tag })))
            .onConflictDoNothing();
        }

        // Also insert into filesTable so Analyse shows finding files too
        await db.insert(filesTable).values({
          scanId,
          name: tmpl.name,
          path: fullPath,
          extension: tmpl.ext,
          sizeBytes: tmpl.sizeBytes,
          category: aiResult.category ?? "Other",
          status: fileStatusForFindingType(tmpl.type),
          tags: aiResult.tags,
        });
      }
    }

    await db.insert(activityTable).values({
      scanId,
      type: "classification_complete",
      message: `Classification complete — ${TOTAL_FILES.toLocaleString()} files categorised, ${TYPE_FINDINGS.length} issues detected`,
      status: "success",
    });

    // ── Phase 3: Duplicate groups ───────────────────────────────────────────
    await new Promise<void>((resolve) => setTimeout(resolve, STEP_MS));

    const [check3] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (!check3 || check3.status === "cancelled") return;

    await db.update(scansTable).set({ progressPercent: 95 }).where(eq(scansTable.id, scanId));

    let dupFileCount = 0;
    let totalRecoverableBytes = 0;

    for (const grp of DUP_GROUPS) {
      const totalSizeBytes = grp.members.reduce((s, m) => s + m.sizeBytes, 0);
      const savedBytes = totalSizeBytes - (grp.members[0]?.sizeBytes ?? 0);
      totalRecoverableBytes += savedBytes;

      const [group] = await db
        .insert(duplicateGroupsTable)
        .values({ scanId, hash: grp.hash, status: "pending", totalSizeBytes, savedBytes, confidence: 1, explanation: grp.explanation })
        .returning();

      let canonicalFindingId: number | null = null;

      for (let idx = 0; idx < grp.members.length; idx++) {
        const member = grp.members[idx]!;
        const fullPath = `${scanPath}/${member.dir}/${member.name}`;

        const aiResult = await classifyWithAI({
          path: fullPath,
          name: member.name,
          extension: member.ext,
          sizeBytes: member.sizeBytes,
          findingType: "duplicate",
        });

        const [dup] = await db
          .insert(findingsTable)
          .values({
            scanId,
            type: "duplicate",
            path: fullPath,
            name: member.name,
            extension: member.ext,
            sizeBytes: member.sizeBytes,
            hash: grp.hash,
            duplicateGroupHash: grp.hash,
            duplicateGroupId: group.id,
            findingStatus: "duplicate",
            riskLevel: "medium",
            reason: grp.explanation,
            aiCategory: aiResult.category,
            aiSubcategory: aiResult.subcategory,
            aiConfidence: aiResult.confidence,
            aiExplanation: aiResult.explanation,
            aiTags: aiResult.tags,
            aiSuggestedDestination: aiResult.suggestedDestination,
            aiSuggestedAction: aiResult.suggestedAction,
            aiProvider: aiResult.provider,
          })
          .returning();

        if (dup) {
          if (idx === 0) canonicalFindingId = dup.id;

          await db.insert(aiClassificationsTable).values({
            findingId: dup.id,
            provider: aiResult.provider,
            category: aiResult.category,
            subcategory: aiResult.subcategory,
            confidence: aiResult.confidence,
            explanation: aiResult.explanation,
            suggestedDestination: aiResult.suggestedDestination,
            suggestedAction: aiResult.suggestedAction,
          });

          if (aiResult.tags.length > 0) {
            await db
              .insert(semanticTagsTable)
              .values(aiResult.tags.map((tag) => ({ findingId: dup.id, tag })))
              .onConflictDoNothing();
          }

          // Insert into filesTable so Analyse shows duplicate file members
          await db.insert(filesTable).values({
            scanId,
            name: member.name,
            path: fullPath,
            extension: member.ext,
            sizeBytes: member.sizeBytes,
            category: aiResult.category ?? "Other",
            status: "review",
            tags: aiResult.tags,
          });
        }
      }

      if (canonicalFindingId !== null) {
        await db
          .update(duplicateGroupsTable)
          .set({ canonicalFindingId })
          .where(eq(duplicateGroupsTable.id, group.id));
      }

      dupFileCount += grp.members.length;
    }

    const recoverableMb = Math.round(totalRecoverableBytes / 1_000_000);
    await db.insert(activityTable).values({
      scanId,
      type: "duplicate_found",
      message: `${DUP_GROUPS.length} duplicate groups detected (${dupFileCount} files, ${recoverableMb} MB recoverable)`,
      status: "warning",
    });

    // ── Phase 4: Finalise ───────────────────────────────────────────────────
    const totalFindings = TYPE_FINDINGS.length + dupFileCount;
    const corruptedCount = TYPE_FINDINGS.filter((f) => f.sizeBytes === 0).length;

    await db
      .insert(scanRootsTable)
      .values({ path: scanPath, scanCount: 1 })
      .onConflictDoUpdate({
        target: scanRootsTable.path,
        set: { scanCount: sql`${scanRootsTable.scanCount} + 1`, lastScannedAt: new Date() },
      });

    await db.update(scansTable).set({
      status: "completed",
      filesScanned: TOTAL_FILES,
      progressPercent: 100,
      completedAt: new Date(),
      findingsCount: totalFindings,
      duplicatesFound: DUP_GROUPS.length,
      corruptedFound: corruptedCount,
    }).where(eq(scansTable.id, scanId));

    await db.insert(activityTable).values({
      scanId,
      type: "scan_complete",
      message: `Demo scan complete — ${TOTAL_FILES.toLocaleString()} files, ${totalFindings} findings (${DUP_GROUPS.length} duplicate groups)`,
      status: "success",
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(scansTable).set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
      progressPercent: 0,
    }).where(eq(scansTable.id, scanId)).catch(() => {});

    await db.insert(activityTable).values({
      type: "error",
      message: `Demo scan failed: ${message}`,
      status: "error",
    }).catch(() => {});
  }
}
