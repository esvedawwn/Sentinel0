/**
 * LocalRuleProvider
 *
 * A deterministic, offline classifier that uses filename patterns, file
 * extensions, path segments, size, finding type, and neighbouring filenames
 * to categorise files into the full Sentinel category set. Requires no API
 * key or network access — always available.
 *
 * Safety: read-only. No filesystem I/O is performed.
 */

import type {
  AICategory,
  AIClassificationInput,
  AIClassificationResult,
  AIProvider,
  AIRecommendation,
} from "../types.js";

// ---------------------------------------------------------------------------
// Extension sets
// ---------------------------------------------------------------------------

const DESIGN_EXTS = new Set([
  ".psd", ".ai", ".sketch", ".fig", ".xd", ".indd", ".idlk",
  ".eps", ".afdesign", ".afpub", ".afphoto", ".cdr", ".xcf",
]);

const VECTOR_BRAND_EXTS = new Set([".svg", ".ai", ".eps"]);

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".heic", ".heif", ".raw", ".cr2",
  ".cr3", ".nef", ".dng", ".bmp", ".tiff", ".tif", ".webp", ".avif",
]);

const RAW_IMAGE_EXTS = new Set([".raw", ".cr2", ".cr3", ".nef", ".dng"]);

const VIDEO_EXTS = new Set([
  ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".m4v", ".webm", ".flv",
  ".mpg", ".mpeg", ".3gp", ".ts",
]);

const AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".opus", ".wma", ".aiff",
]);

const DOC_EXTS = new Set([
  ".pdf", ".doc", ".docx", ".odt", ".rtf", ".pages", ".txt",
]);

const SPREADSHEET_EXTS = new Set([
  ".xls", ".xlsx", ".csv", ".ods", ".numbers",
]);

const TEMP_EXTS = new Set([
  ".tmp", ".temp", ".bak", ".backup", ".cache",
  ".crdownload", ".part", ".partial", ".swp", ".swo",
]);

const LOCK_EXTS = new Set([".lock", ".lck", ".pid"]);

const CODE_EXTS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs", ".java",
  ".cs", ".cpp", ".c", ".h", ".swift", ".kt", ".php", ".sh", ".bash",
  ".zsh", ".ps1", ".lua", ".dart", ".vue", ".scss", ".sass", ".less",
]);

const WEB_DEV_FILES = new Set([
  "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "tsconfig.json", "vite.config.ts", "vite.config.js", "webpack.config.js",
  ".gitignore", ".env", ".env.example", "next.config.js", "tailwind.config.js",
]);

const WEB_DEV_EXTS = new Set([".html", ".css", ".vue", ".astro"]);

const SCREENSHOT_PATTERN = /^(screenshot|screen shot|screen recording|cleanshot)/i;

// ---------------------------------------------------------------------------
// Keyword sets (checked against lowercased filename and path segments)
// ---------------------------------------------------------------------------

const LEGAL_KEYWORDS = [
  "contract", "agreement", "nda", "lease", "deed", "will", "trust",
  "lawsuit", "court", "litigation", "subpoena", "settlement", "attorney",
  "legal", "clause", "terms", "amendment", "affidavit", "notari",
  "conveyance", "mortgage", "lien", "easement",
];

const TAX_KEYWORDS = [
  "tax", "w2", "w-2", "1099", "1040", "irs", "vat", "gst", "hmrc",
  "self-assessment", "self assessment", "tax return", "deduction",
];

const RECEIPT_KEYWORDS = ["receipt", "proof of purchase", "till slip"];

const INVOICE_KEYWORDS = ["invoice", "bill", "quote", "estimate"];

const BANKING_KEYWORDS = [
  "statement", "payment", "payroll", "salary", "bank", "finance",
  "financial", "budget", "expense", "account", "ledger", "balance",
  "transaction", "paycheck", "paystub",
];

const MEDICAL_KEYWORDS = [
  "medical", "health", "prescription", "diagnosis", "lab", "pathology",
  "doctor", "physician", "hospital", "clinic", "insurance", "patient",
  "rx", "ehr", "claim", "x-ray", "xray", "mri", "ct scan", "blood",
  "vaccination", "vaccine", "immunis", "immuniz", "pharmacy",
];

const RENOVATION_KEYWORDS = [
  "renovation", "remodel", "construction", "blueprint", "floor plan",
  "floorplan", "contractor", "permit", "building", "architect",
  "plumbing", "electrical", "hvac", "roofing", "foundation", "materials", "fixture",
];

const PROPERTY_KEYWORDS = [
  "property", "deed", "title", "survey", "appraisal", "escrow",
  "closing disclosure", "hoa", "landlord", "tenant", "rental agreement",
];

const IDENTITY_KEYWORDS = [
  "passport", "birth certificate", "social security", "ssn",
  "driver", "license", "licence", "visa", "national id", "id card",
];

const PERSONAL_DOC_KEYWORDS = [
  "resume", "curriculum vitae", " cv", "marriage", "death", "adoption",
  "scholarship", "diploma", "degree", "transcript",
];

const BUSINESS_KEYWORDS = [
  "proposal", "business plan", "pitch deck", "memo", "minutes",
  "org chart", "sop", "policy", "handbook", "roadmap", "okr", "kpi",
];

const BRANDING_KEYWORDS = [
  "logo", "brand", "branding", "style guide", "styleguide", "brandbook",
  "identity guidelines", "wordmark",
];

const WEB_DEV_PATH_KEYWORDS = [
  "src", "node_modules", "dist", "build", "components", "webapp", "frontend", "backend",
];

const DESIGN_PATH_KEYWORDS = [
  "design", "creative", "artwork", "asset", "mockup", "wireframe",
  "prototype", "ui", "ux", "figma", "sketch",
];

const PHOTO_PATH_KEYWORDS = ["photo", "picture", "camera", "gallery", "album"];
const VIDEO_PATH_KEYWORDS = ["video", "movie", "footage", "clips"];
const AUDIO_PATH_KEYWORDS = ["music", "audio", "soundtrack", "recording", "podcast"];

const LEGAL_PATH_KEYWORDS = ["legal", "law", "contract", "agreement", "compliance"];
const BANKING_PATH_KEYWORDS = ["finance", "financial", "banking", "accounting", "payroll", "budget"];
const TAX_PATH_KEYWORDS = ["tax", "taxes"];
const MEDICAL_PATH_KEYWORDS = ["medical", "health", "doctor", "hospital", "insurance"];
const RENOVATION_PATH_KEYWORDS = ["renovation", "construction", "remodel", "home improvement"];
const PROPERTY_PATH_KEYWORDS = ["property", "real estate", "realestate", "mortgage"];
const BUSINESS_PATH_KEYWORDS = ["business", "company", "corp", "startup"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pathSegments(filePath: string): string[] {
  return filePath.toLowerCase().replace(/\\/g, "/").split("/").filter(Boolean);
}

function containsKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw.trim();
  }
  return null;
}

function segmentsContainKeyword(segments: string[], keywords: string[]): string | null {
  for (const seg of segments) {
    const match = containsKeyword(seg, keywords);
    if (match) return match;
  }
  return null;
}

interface ResultInput {
  category: AICategory;
  subcategory?: string | null;
  confidence: number;
  explanation: string;
  tags: string[];
  suggestedDestination: string | null;
  suggestedAction: string;
  recommendation: Omit<AIRecommendation, "reversible" | "requiresConfirmation"> & {
    reversible?: boolean;
  };
}

function makeResult(r: ResultInput): AIClassificationResult {
  return {
    category: r.category,
    subcategory: r.subcategory ?? null,
    confidence: Math.min(100, Math.max(0, Math.round(r.confidence))),
    explanation: r.explanation,
    tags: r.tags,
    suggestedDestination: r.suggestedDestination,
    suggestedAction: r.suggestedAction,
    recommendation: {
      action: r.recommendation.action,
      reason: r.recommendation.reason,
      safe: r.recommendation.safe,
      reversible: r.recommendation.reversible ?? r.recommendation.action !== "delete",
      requiresConfirmation: true,
    },
    provider: "local-rule",
  };
}

// ---------------------------------------------------------------------------
// Main classifier function
// ---------------------------------------------------------------------------

function classify(input: AIClassificationInput): AIClassificationResult {
  const nameLower = input.name.toLowerCase();
  const ext = input.extension.toLowerCase();
  const type = input.findingType;
  const segments = pathSegments(input.path);
  // Exclude the filename itself from path-keyword checks
  const dirSegments = segments.slice(0, -1);
  const neighbours = (input.neighbouringFilenames ?? []).map((n) => n.toLowerCase());

  // -------------------------------------------------------------------
  // 1. Duplicate candidates — finding type is conclusive
  // -------------------------------------------------------------------

  if (type === "duplicate") {
    return makeResult({
      category: "Duplicate Candidates",
      confidence: 90,
      explanation: "This file's contents match another file already indexed in this scan — a byte-for-byte duplicate.",
      tags: ["duplicate", "review"],
      suggestedDestination: null,
      suggestedAction: "Review both copies and keep the one in the more appropriate location.",
      recommendation: { action: "review", reason: "Confirm which copy to keep before removing either.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 2. Lock files — finding type or extension is conclusive
  // -------------------------------------------------------------------

  if (type === "idlk_file" || LOCK_EXTS.has(ext) || nameLower.endsWith(".lock")) {
    return makeResult({
      category: "Lock Files",
      subcategory: type === "idlk_file" ? "Adobe InDesign lock" : "Application lock",
      confidence: 96,
      explanation: type === "idlk_file"
        ? "Adobe InDesign lock file (.idlk) — created automatically while InDesign is open."
        : `Lock file (${ext || nameLower}) — created by an application to claim exclusive access to a resource.`,
      tags: ["lock-file", "temp"],
      suggestedDestination: null,
      suggestedAction: "Safe to delete once the owning application is closed.",
      recommendation: { action: "delete", reason: "Lock files have no data value; they are recreated automatically.", safe: true },
    });
  }

  if (type === "locked_file") {
    return makeResult({
      category: "Lock Files",
      confidence: 82,
      explanation: "Lock file (.locked) — indicates an application has claimed ownership of a resource. Review before removing.",
      tags: ["lock-file", "temp"],
      suggestedDestination: null,
      suggestedAction: "Verify no application is currently using this file before deleting.",
      recommendation: { action: "review", reason: "Verify no application is currently using this file.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 3. Screenshots — filename pattern
  // -------------------------------------------------------------------

  if (SCREENSHOT_PATTERN.test(nameLower) && IMAGE_EXTS.has(ext)) {
    return makeResult({
      category: "Screenshots",
      confidence: 92,
      explanation: "Filename matches common screenshot/screen-recording naming conventions.",
      tags: ["screenshot", "image"],
      suggestedDestination: "Pictures/Screenshots",
      suggestedAction: "Review periodically — screenshots accumulate quickly and are rarely needed long-term.",
      recommendation: { action: "review", reason: "Screenshots are often transient; confirm before bulk deleting.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 4. Other definite junk — finding type is conclusive
  // -------------------------------------------------------------------

  if (type === "zero_byte") {
    return makeResult({
      category: "Temporary Files",
      confidence: 95,
      explanation: "Empty file with 0 bytes of content — likely a leftover placeholder, failed download, or incomplete write.",
      tags: ["empty", "zero-byte", "junk"],
      suggestedDestination: null,
      suggestedAction: "Safe to delete — the file has no content to lose.",
      recommendation: { action: "delete", reason: "File contains no data.", safe: true },
    });
  }

  if (type === "empty_folder") {
    return makeResult({
      category: "Temporary Files",
      confidence: 95,
      explanation: "Empty folder with no children — leftover from a moved or deleted collection.",
      tags: ["empty-folder", "junk"],
      suggestedDestination: null,
      suggestedAction: "Safe to delete — the folder holds nothing.",
      recommendation: { action: "delete", reason: "Folder contains no files or subfolders.", safe: true },
    });
  }

  // -------------------------------------------------------------------
  // 5. Installer / archive — finding type is highly conclusive
  // -------------------------------------------------------------------

  if (type === "installer") {
    const mb = (input.sizeBytes / (1024 * 1024)).toFixed(0);
    return makeResult({
      category: "Installers",
      confidence: 93,
      explanation: `Installation package (${ext}, ${mb} MB) — once software is installed this file is no longer needed.`,
      tags: ["installer", "software", "package", ext.replace(".", "")],
      suggestedDestination: null,
      suggestedAction: "Delete once you've confirmed the software installed correctly — it can be re-downloaded if needed.",
      recommendation: { action: "delete", reason: "Installer packages can be re-downloaded from the vendor if needed.", safe: false },
    });
  }

  if (type === "archive") {
    return makeResult({
      category: "Archives",
      confidence: 90,
      explanation: `Compressed archive (${ext}) — verify the contents are either backed up or no longer needed before removing.`,
      tags: ["archive", "compressed", ext.replace(".", "")],
      suggestedDestination: null,
      suggestedAction: "Inspect the archive contents before deleting.",
      recommendation: { action: "review", reason: "Archives may contain important files. Check contents before deleting.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 6. Temp/junk by extension
  // -------------------------------------------------------------------

  if (TEMP_EXTS.has(ext)) {
    return makeResult({
      category: "Temporary Files",
      confidence: 85,
      explanation: `Temporary or partial file (${ext}) — typically safe to remove after verifying no application depends on it.`,
      tags: ["temp", "junk", ext.replace(".", "")],
      suggestedDestination: null,
      suggestedAction: "Safe to remove after confirming no active process needs it.",
      recommendation: { action: "delete", reason: "Temporary files are usually safe to remove.", safe: true },
    });
  }

  if (ext === ".log" && (nameLower.includes("log") || dirSegments.some((s) => s === "logs" || s === "log"))) {
    return makeResult({
      category: "Temporary Files",
      confidence: 78,
      explanation: "Log file — useful for debugging but accumulates over time. Safe to remove once reviewed.",
      tags: ["log", "temp"],
      suggestedDestination: null,
      suggestedAction: "Review for anything useful, then delete.",
      recommendation: { action: "review", reason: "Logs may contain useful diagnostic information.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 7. Web Development — package manifests / config / source
  // -------------------------------------------------------------------

  if (WEB_DEV_FILES.has(nameLower) || WEB_DEV_EXTS.has(ext)) {
    const kw = segmentsContainKeyword(dirSegments, WEB_DEV_PATH_KEYWORDS);
    return makeResult({
      category: "Web Development",
      confidence: kw ? 92 : 84,
      explanation: `Recognised web project file (${input.name})${kw ? ` inside a "${kw}" folder` : ""} — part of a software/web project.`,
      tags: ["web", "development", "project"],
      suggestedDestination: null,
      suggestedAction: "Keep with the rest of the project; do not move individually.",
      recommendation: { action: "keep", reason: "Part of a project's source tree — moving it individually would break the build.", safe: true },
    });
  }

  {
    const zipNearProject = ext === ".zip" && neighbours.some((n) =>
      WEB_DEV_FILES.has(n) || n === "src" || n === "node_modules"
    );
    if (zipNearProject) {
      return makeResult({
        category: "Web Development",
        confidence: 70,
        explanation: "This ZIP archive sits beside package.json/source folders — likely a web project export or backup.",
        tags: ["web", "archive", "project"],
        suggestedDestination: null,
        suggestedAction: "Verify it's an outdated project backup before deleting.",
        recommendation: { action: "review", reason: "Could be a valuable project backup.", safe: false },
      });
    }
  }

  // -------------------------------------------------------------------
  // 8. Branding — vector/logo assets with brand keywords
  // -------------------------------------------------------------------

  if (VECTOR_BRAND_EXTS.has(ext)) {
    const kw = containsKeyword(nameLower, BRANDING_KEYWORDS) ?? segmentsContainKeyword(dirSegments, BRANDING_KEYWORDS);
    if (kw) {
      return makeResult({
        category: "Branding",
        confidence: 90,
        explanation: `Vector asset (${ext}) with branding keyword "${kw}" — part of a brand identity or logo system.`,
        tags: ["branding", "logo", "vector"],
        suggestedDestination: "Design/Branding",
        suggestedAction: "Keep — branding assets are reused across many projects.",
        recommendation: { action: "keep", reason: "Brand assets should be preserved as a single source of truth.", safe: true },
      });
    }
  }

  // -------------------------------------------------------------------
  // 9. Design — strong extension signals
  // -------------------------------------------------------------------

  if (DESIGN_EXTS.has(ext)) {
    const kw = segmentsContainKeyword(dirSegments, DESIGN_PATH_KEYWORDS);
    const conf = kw ? 95 : 90;
    return makeResult({
      category: "Design",
      confidence: conf,
      explanation: `Design file (${ext})${kw ? ` in a "${kw}" folder` : ""} — belongs to a creative or design workflow.`,
      tags: ["design", "creative", ext.replace(".", "")],
      suggestedDestination: "Design",
      suggestedAction: "Keep and back up — design source files are usually not reproducible.",
      recommendation: { action: "keep", reason: "Design source files should be retained and backed up.", safe: true },
    });
  }

  {
    const kw = segmentsContainKeyword(dirSegments, DESIGN_PATH_KEYWORDS);
    if (kw && (DOC_EXTS.has(ext) || ext === ".pdf")) {
      return makeResult({
        category: "Design",
        confidence: 75,
        explanation: `Document in a "${kw}" folder — likely a design brief, spec, or creative reference.`,
        tags: ["design", "document"],
        suggestedDestination: "Design",
        suggestedAction: "Keep alongside the related design project.",
        recommendation: { action: "keep", reason: "Creative project documents should be archived with the project.", safe: true },
      });
    }
  }

  // -------------------------------------------------------------------
  // 10. Media — Photography / Video / Audio, each its own category
  // -------------------------------------------------------------------

  if (IMAGE_EXTS.has(ext)) {
    const isRaw = RAW_IMAGE_EXTS.has(ext);
    const kw = segmentsContainKeyword(dirSegments, PHOTO_PATH_KEYWORDS);
    return makeResult({
      category: "Photography",
      subcategory: isRaw ? "RAW original" : "Photo",
      confidence: isRaw ? 95 : 88,
      explanation: isRaw
        ? `RAW camera file (${ext}) — original image data; cannot be regenerated from a compressed copy.`
        : `Image file (${ext})${kw ? ` in a "${kw}" folder` : ""}.`,
      tags: ["image", "photography", isRaw ? "raw" : "photo", ext.replace(".", "")],
      suggestedDestination: "Pictures",
      suggestedAction: isRaw
        ? "Back up before considering deletion — this is an unrepeatable original."
        : "Review for duplicates before removing.",
      recommendation: {
        action: isRaw ? "keep" : "review",
        reason: isRaw
          ? "RAW files are originals — back up before any deletion."
          : "Review whether duplicates exist before removing.",
        safe: false,
      },
    });
  }

  if (VIDEO_EXTS.has(ext)) {
    const mb = (input.sizeBytes / (1024 * 1024)).toFixed(0);
    return makeResult({
      category: "Video",
      confidence: 90,
      explanation: `Video file (${ext}, ${mb} MB) — likely a recording, export, or downloaded clip.`,
      tags: ["video", ext.replace(".", "")],
      suggestedDestination: "Movies",
      suggestedAction: "Video files can be large; verify duplicates or unneeded exports before deleting.",
      recommendation: { action: "review", reason: "Video files can be large; verify duplicates before deleting.", safe: false },
    });
  }

  if (AUDIO_EXTS.has(ext)) {
    return makeResult({
      category: "Audio",
      confidence: 88,
      explanation: `Audio file (${ext}) — music track, recording, or sound effect.`,
      tags: ["audio", ext.replace(".", "")],
      suggestedDestination: "Music",
      suggestedAction: "Keep if original; confirm it's backed up elsewhere.",
      recommendation: { action: "keep", reason: "Review whether this audio is backed up elsewhere.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 11. Code / Software (extension-based, no installer finding type)
  // -------------------------------------------------------------------

  if (CODE_EXTS.has(ext)) {
    return makeResult({
      category: "Software",
      confidence: 85,
      explanation: `Source code file (${ext}) — likely part of a development project.`,
      tags: ["code", "software", "source", ext.replace(".", "")],
      suggestedDestination: null,
      suggestedAction: "Keep under version control; do not move individually.",
      recommendation: { action: "keep", reason: "Source files should be kept under version control.", safe: true },
    });
  }

  // -------------------------------------------------------------------
  // 12. Keyword-based document classification
  //     For PDFs, Word docs, spreadsheets — check name + path keywords
  // -------------------------------------------------------------------

  const isDocument = DOC_EXTS.has(ext) || SPREADSHEET_EXTS.has(ext);

  if (isDocument || ext === "") {
    const checks: Array<{
      category: AICategory;
      kw: string | null;
      docConf: number;
      pathConf: number;
      recAction: AIRecommendation["action"];
      destination: string | null;
    }> = [
      { category: "Legal", kw: containsKeyword(nameLower, LEGAL_KEYWORDS) ?? segmentsContainKeyword(dirSegments, LEGAL_PATH_KEYWORDS), docConf: 88, pathConf: 72, recAction: "keep", destination: "Documents/Legal" },
      { category: "Tax", kw: containsKeyword(nameLower, TAX_KEYWORDS) ?? segmentsContainKeyword(dirSegments, TAX_PATH_KEYWORDS), docConf: 89, pathConf: 70, recAction: "keep", destination: "Documents/Tax" },
      { category: "Receipts", kw: containsKeyword(nameLower, RECEIPT_KEYWORDS), docConf: 85, pathConf: 65, recAction: "keep", destination: "Documents/Receipts" },
      { category: "Invoices", kw: containsKeyword(nameLower, INVOICE_KEYWORDS), docConf: 85, pathConf: 65, recAction: "keep", destination: "Documents/Invoices" },
      { category: "Banking", kw: containsKeyword(nameLower, BANKING_KEYWORDS) ?? segmentsContainKeyword(dirSegments, BANKING_PATH_KEYWORDS), docConf: 86, pathConf: 68, recAction: "keep", destination: "Documents/Banking" },
      { category: "Medical", kw: containsKeyword(nameLower, MEDICAL_KEYWORDS) ?? segmentsContainKeyword(dirSegments, MEDICAL_PATH_KEYWORDS), docConf: 87, pathConf: 70, recAction: "keep", destination: "Documents/Medical" },
      { category: "Renovation", kw: containsKeyword(nameLower, RENOVATION_KEYWORDS) ?? segmentsContainKeyword(dirSegments, RENOVATION_PATH_KEYWORDS), docConf: 84, pathConf: 65, recAction: "keep", destination: "Documents/Renovation" },
      { category: "Property", kw: containsKeyword(nameLower, PROPERTY_KEYWORDS) ?? segmentsContainKeyword(dirSegments, PROPERTY_PATH_KEYWORDS), docConf: 84, pathConf: 65, recAction: "keep", destination: "Documents/Property" },
      { category: "Identity Documents", kw: containsKeyword(nameLower, IDENTITY_KEYWORDS), docConf: 89, pathConf: 72, recAction: "keep", destination: "Documents/Identity" },
      { category: "Personal Documents", kw: containsKeyword(nameLower, PERSONAL_DOC_KEYWORDS), docConf: 85, pathConf: 68, recAction: "keep", destination: "Documents/Personal" },
      { category: "Business", kw: containsKeyword(nameLower, BUSINESS_KEYWORDS) ?? segmentsContainKeyword(dirSegments, BUSINESS_PATH_KEYWORDS), docConf: 82, pathConf: 62, recAction: "keep", destination: "Documents/Business" },
    ];

    for (const c of checks) {
      if (c.kw) {
        return makeResult({
          category: c.category,
          confidence: isDocument ? c.docConf : c.pathConf,
          explanation: `Contains "${c.kw}" keyword${ext ? ` in a ${ext} file` : ""} — likely a ${c.category.toLowerCase()} document.`,
          tags: [c.category.toLowerCase().replace(/\s+/g, "-"), "document", c.kw],
          suggestedDestination: c.destination,
          suggestedAction: `Keep and file under ${c.destination ?? c.category} for record-keeping.`,
          recommendation: { action: c.recAction, reason: `${c.category} records should be retained per applicable record-keeping requirements.`, safe: true },
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // 13. Path-only fallbacks (lower confidence, media/document hints)
  // -------------------------------------------------------------------

  {
    const videoKw = segmentsContainKeyword(dirSegments, VIDEO_PATH_KEYWORDS);
    if (videoKw) {
      return makeResult({ category: "Video", confidence: 58, explanation: `File in a "${videoKw}" folder — probable video asset.`, tags: ["video"], suggestedDestination: "Movies", suggestedAction: "Review whether this asset is still needed.", recommendation: { action: "review", reason: "Verify whether this media is still needed.", safe: false } });
    }
    const audioKw = segmentsContainKeyword(dirSegments, AUDIO_PATH_KEYWORDS);
    if (audioKw) {
      return makeResult({ category: "Audio", confidence: 58, explanation: `File in a "${audioKw}" folder — probable audio asset.`, tags: ["audio"], suggestedDestination: "Music", suggestedAction: "Review whether this asset is still needed.", recommendation: { action: "review", reason: "Verify whether this media is still needed.", safe: false } });
    }
    const photoKw = segmentsContainKeyword(dirSegments, PHOTO_PATH_KEYWORDS);
    if (photoKw) {
      return makeResult({ category: "Photography", confidence: 58, explanation: `File in a "${photoKw}" folder — probable photo asset.`, tags: ["photography"], suggestedDestination: "Pictures", suggestedAction: "Review whether this asset is still needed.", recommendation: { action: "review", reason: "Verify whether this media is still needed.", safe: false } });
    }
  }

  // -------------------------------------------------------------------
  // 14. Large file heuristic
  // -------------------------------------------------------------------

  if (type === "large_file") {
    const mb = (input.sizeBytes / (1024 * 1024)).toFixed(0);
    if (VIDEO_EXTS.has(ext) || [".iso", ".img", ".vmdk", ".vhd"].includes(ext)) {
      return makeResult({
        category: "Video",
        confidence: 78,
        explanation: `Large ${ext} file (${mb} MB) — consistent with a video export, disk image, or virtual machine.`,
        tags: ["large-file", "video"],
        suggestedDestination: null,
        suggestedAction: "Large files occupy significant space; verify before removing.",
        recommendation: { action: "review", reason: "Large files occupy significant space; verify before removing.", safe: false },
      });
    }
    return makeResult({
      category: "Unknown",
      confidence: 45,
      explanation: `Large file (${mb} MB, ${ext || "no extension"}) — no recognisable category pattern. Manual review recommended.`,
      tags: ["large-file"],
      suggestedDestination: null,
      suggestedAction: "Inspect manually — no category pattern matched.",
      recommendation: { action: "review", reason: "Large files without a clear category warrant manual inspection.", safe: false },
    });
  }

  // -------------------------------------------------------------------
  // 15. Unknown — no rule matched
  // -------------------------------------------------------------------

  return makeResult({
    category: "Unknown",
    confidence: 40,
    explanation: `No category pattern recognised for "${input.name}" (${ext || "no extension"}). Manual inspection recommended.`,
    tags: ["unknown"],
    suggestedDestination: null,
    suggestedAction: "Inspect manually — no category pattern matched.",
    recommendation: { action: "review", reason: "File could not be automatically categorised.", safe: false },
  });
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class LocalRuleProvider implements AIProvider {
  readonly name = "local-rule";
  readonly kind = "local" as const;

  async classify(input: AIClassificationInput): Promise<AIClassificationResult> {
    return classify(input);
  }

  isAvailable(): boolean {
    return true; // Always available — no external dependency
  }
}

/** Exported for unit testing without instantiating the provider class. */
export { classify as classifyLocalRule };
