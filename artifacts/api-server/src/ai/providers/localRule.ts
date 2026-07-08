/**
 * LocalRuleProvider
 *
 * A deterministic, offline classifier that uses filename patterns, file
 * extensions, path segments, size, and finding type to categorise files.
 * Requires no API key or network access — always available.
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
  ".eps", ".svg", ".afdesign", ".afpub", ".afphoto", ".cdr", ".xcf",
]);

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".heic", ".heif", ".raw", ".cr2",
  ".cr3", ".nef", ".dng", ".bmp", ".tiff", ".tif", ".webp", ".avif",
]);

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
  ".crdownload", ".part", ".partial",
]);

const CODE_EXTS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs", ".java",
  ".cs", ".cpp", ".c", ".h", ".swift", ".kt", ".php", ".sh", ".bash",
  ".zsh", ".ps1", ".lua", ".dart", ".vue", ".scss", ".sass", ".less",
]);

// ---------------------------------------------------------------------------
// Keyword sets (checked against lowercased filename and path segments)
// ---------------------------------------------------------------------------

const LEGAL_KEYWORDS = [
  "contract", "agreement", "nda", "lease", "deed", "will", "trust",
  "lawsuit", "court", "litigation", "subpoena", "settlement", "attorney",
  "legal", "clause", "terms", "amendment", "affidavit", "notari",
  "conveyance", "mortgage", "lien", "easement",
];

const BANKING_KEYWORDS = [
  "invoice", "receipt", "statement", "payment", "payroll", "salary",
  "bank", "finance", "financial", "budget", "expense", "tax", "w2",
  "1099", "w-2", "1040", "irs", "vat", "gst", "account", "ledger",
  "balance", "transaction", "invoice", "bill", "quote", "estimate",
  "paycheck", "paystub",
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
  "plumbing", "electrical", "hvac", "roofing", "foundation", "quote",
  "bid", "estimate", "materials", "fixture",
];

const PERSONAL_DOC_KEYWORDS = [
  "passport", "birth", "certificate", "social security", "ssn",
  "driver", "license", "visa", "resume", "curriculum vitae", "cv",
  "national id", "identity", "marriage", "death", "adoption",
  "scholarship", "diploma", "degree", "transcript",
];

const DESIGN_PATH_KEYWORDS = [
  "design", "creative", "artwork", "asset", "mockup", "wireframe",
  "prototype", "brand", "logo", "ui", "ux", "figma", "sketch",
];

const MEDIA_PATH_KEYWORDS = [
  "photo", "picture", "image", "video", "movie", "music", "audio",
  "media", "camera", "gallery", "album", "soundtrack", "recording",
];

const LEGAL_PATH_KEYWORDS = [
  "legal", "law", "contract", "agreement", "compliance",
];

const BANKING_PATH_KEYWORDS = [
  "finance", "financial", "banking", "accounting", "tax", "payroll",
  "invoice", "budget",
];

const MEDICAL_PATH_KEYWORDS = [
  "medical", "health", "doctor", "hospital", "insurance",
];

const RENOVATION_PATH_KEYWORDS = [
  "renovation", "construction", "remodel", "home improvement",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pathSegments(filePath: string): string[] {
  return filePath.toLowerCase().replace(/\\/g, "/").split("/").filter(Boolean);
}

function containsKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
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

function makeResult(
  category: AICategory,
  confidence: number,
  explanation: string,
  tags: string[],
  recommendation: AIRecommendation,
): AIClassificationResult {
  return {
    category,
    confidence: Math.min(100, Math.max(0, Math.round(confidence))),
    explanation,
    tags,
    recommendation,
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

  // -------------------------------------------------------------------
  // 1. Definite junk — finding type is conclusive
  // -------------------------------------------------------------------

  if (type === "idlk_file") {
    return makeResult(
      "Temporary / Junk", 98,
      "Adobe InDesign lock file (.idlk) — created automatically while InDesign is open. Safe to delete when InDesign is closed.",
      ["lock-file", "adobe", "indesign", "temp"],
      { action: "delete", reason: "Lock files have no data value; they are recreated automatically.", safe: true },
    );
  }

  if (type === "zero_byte") {
    return makeResult(
      "Temporary / Junk", 95,
      "Empty file with 0 bytes of content — likely a leftover placeholder, failed download, or incomplete write.",
      ["empty", "zero-byte", "junk"],
      { action: "delete", reason: "File contains no data.", safe: true },
    );
  }

  if (type === "empty_folder") {
    return makeResult(
      "Temporary / Junk", 95,
      "Empty folder with no children — leftover from a moved or deleted collection.",
      ["empty-folder", "junk"],
      { action: "delete", reason: "Folder contains no files or subfolders.", safe: true },
    );
  }

  if (type === "locked_file") {
    return makeResult(
      "Temporary / Junk", 82,
      "Lock file (.locked) — indicates an application has claimed ownership of a resource. Review before removing.",
      ["lock-file", "temp"],
      { action: "review", reason: "Verify no application is currently using this file.", safe: false },
    );
  }

  // -------------------------------------------------------------------
  // 2. Installer / archive — type is highly conclusive
  // -------------------------------------------------------------------

  if (type === "installer") {
    const mb = (input.sizeBytes / (1024 * 1024)).toFixed(0);
    return makeResult(
      "Software", 93,
      `Installation package (${ext}, ${mb} MB) — once software is installed this file is no longer needed.`,
      ["installer", "software", "package", ext.replace(".", "")],
      { action: "delete", reason: "Installer packages can be re-downloaded from the vendor if needed.", safe: false },
    );
  }

  if (type === "archive") {
    return makeResult(
      "Archives", 90,
      `Compressed archive (${ext}) — verify the contents are either backed up or no longer needed before removing.`,
      ["archive", "compressed", ext.replace(".", "")],
      { action: "review", reason: "Archives may contain important files. Check contents before deleting.", safe: false },
    );
  }

  // -------------------------------------------------------------------
  // 3. Temp/junk by extension
  // -------------------------------------------------------------------

  if (TEMP_EXTS.has(ext)) {
    return makeResult(
      "Temporary / Junk", 85,
      `Temporary or partial file (${ext}) — typically safe to remove after verifying no application depends on it.`,
      ["temp", "junk", ext.replace(".", "")],
      { action: "delete", reason: "Temporary files are usually safe to remove.", safe: true },
    );
  }

  if (ext === ".log" && (nameLower.includes("log") || dirSegments.some(s => s === "logs" || s === "log"))) {
    return makeResult(
      "Temporary / Junk", 78,
      "Log file — useful for debugging but accumulates over time. Safe to remove once reviewed.",
      ["log", "temp"],
      { action: "review", reason: "Logs may contain useful diagnostic information.", safe: false },
    );
  }

  // -------------------------------------------------------------------
  // 4. Design — strong extension signals
  // -------------------------------------------------------------------

  if (DESIGN_EXTS.has(ext)) {
    const kw = segmentsContainKeyword(dirSegments, DESIGN_PATH_KEYWORDS);
    const conf = kw ? 95 : 90;
    return makeResult(
      "Design", conf,
      `Design file (${ext})${kw ? ` in a "${kw}" folder` : ""} — belongs to a creative or design workflow.`,
      ["design", "creative", ext.replace(".", "")],
      { action: "keep", reason: "Design source files should be retained and backed up.", safe: true },
    );
  }

  // Path-hint for design even without design extension
  {
    const kw = segmentsContainKeyword(dirSegments, DESIGN_PATH_KEYWORDS);
    if (kw && (DOC_EXTS.has(ext) || ext === ".pdf")) {
      return makeResult(
        "Design", 75,
        `Document in a "${kw}" folder — likely a design brief, spec, or creative reference.`,
        ["design", "document"],
        { action: "keep", reason: "Creative project documents should be archived with the project.", safe: true },
      );
    }
  }

  // -------------------------------------------------------------------
  // 5. Media — strong extension signals
  // -------------------------------------------------------------------

  if (IMAGE_EXTS.has(ext)) {
    const isRaw = [".raw", ".cr2", ".cr3", ".nef", ".dng"].includes(ext);
    const kw = segmentsContainKeyword(dirSegments, MEDIA_PATH_KEYWORDS);
    return makeResult(
      "Media", isRaw ? 95 : 88,
      isRaw
        ? `RAW camera file (${ext}) — original image data; cannot be regenerated from a compressed copy.`
        : `Image file (${ext})${kw ? ` in a "${kw}" folder` : ""}.`,
      ["image", "media", isRaw ? "raw" : "photo", ext.replace(".", "")],
      {
        action: isRaw ? "keep" : "review",
        reason: isRaw
          ? "RAW files are originals — back up before any deletion."
          : "Review whether duplicates exist before removing.",
        safe: false,
      },
    );
  }

  if (VIDEO_EXTS.has(ext)) {
    const mb = (input.sizeBytes / (1024 * 1024)).toFixed(0);
    return makeResult(
      "Media", 90,
      `Video file (${ext}, ${mb} MB) — likely a recording, export, or downloaded clip.`,
      ["video", "media", ext.replace(".", "")],
      { action: "review", reason: "Video files can be large; verify duplicates before deleting.", safe: false },
    );
  }

  if (AUDIO_EXTS.has(ext)) {
    return makeResult(
      "Media", 88,
      `Audio file (${ext}) — music track, recording, or sound effect.`,
      ["audio", "media", ext.replace(".", "")],
      { action: "keep", reason: "Review whether this audio is backed up elsewhere.", safe: false },
    );
  }

  // -------------------------------------------------------------------
  // 6. Code / Software (extension-based, no installer finding type)
  // -------------------------------------------------------------------

  if (CODE_EXTS.has(ext)) {
    return makeResult(
      "Software", 85,
      `Source code file (${ext}) — likely part of a development project.`,
      ["code", "software", "source", ext.replace(".", "")],
      { action: "keep", reason: "Source files should be kept under version control.", safe: true },
    );
  }

  // -------------------------------------------------------------------
  // 7. Keyword-based document classification
  //    For PDFs, Word docs, spreadsheets — check name + path keywords
  // -------------------------------------------------------------------

  const isDocument = DOC_EXTS.has(ext) || SPREADSHEET_EXTS.has(ext);
  const nameAndDir = [nameLower, ...dirSegments].join(" ");

  if (isDocument || ext === "") {
    // Legal
    const legalKw = containsKeyword(nameLower, LEGAL_KEYWORDS)
      ?? segmentsContainKeyword(dirSegments, LEGAL_PATH_KEYWORDS);
    if (legalKw) {
      return makeResult(
        "Legal", isDocument ? 88 : 72,
        `Contains legal keyword "${legalKw}"${ext ? ` in a ${ext} file` : ""} — likely a legal document or correspondence.`,
        ["legal", "document", legalKw],
        { action: "keep", reason: "Legal documents should be retained per applicable record-keeping requirements.", safe: true },
      );
    }

    // Banking / Finance
    const bankKw = containsKeyword(nameLower, BANKING_KEYWORDS)
      ?? segmentsContainKeyword(dirSegments, BANKING_PATH_KEYWORDS);
    if (bankKw) {
      return makeResult(
        "Banking", isDocument ? 86 : 68,
        `Contains financial keyword "${bankKw}"${ext ? ` in a ${ext} file` : ""} — likely a financial record or statement.`,
        ["banking", "finance", "document", bankKw],
        { action: "keep", reason: "Financial records should be kept for accounting and tax purposes.", safe: true },
      );
    }

    // Medical
    const medKw = containsKeyword(nameLower, MEDICAL_KEYWORDS)
      ?? segmentsContainKeyword(dirSegments, MEDICAL_PATH_KEYWORDS);
    if (medKw) {
      return makeResult(
        "Medical", isDocument ? 87 : 70,
        `Contains medical keyword "${medKw}"${ext ? ` in a ${ext} file` : ""} — likely a health record or insurance document.`,
        ["medical", "health", "document"],
        { action: "keep", reason: "Medical records should be securely retained.", safe: true },
      );
    }

    // Renovation
    const renovKw = containsKeyword(nameLower, RENOVATION_KEYWORDS)
      ?? segmentsContainKeyword(dirSegments, RENOVATION_PATH_KEYWORDS);
    if (renovKw) {
      return makeResult(
        "Renovation", isDocument ? 84 : 65,
        `Contains renovation keyword "${renovKw}"${ext ? ` in a ${ext} file` : ""} — likely a project quote, blueprint, or permit.`,
        ["renovation", "construction", "document"],
        { action: "keep", reason: "Renovation documents are important for warranty, insurance, and resale.", safe: true },
      );
    }

    // Personal Documents
    const personalKw = containsKeyword(nameLower, PERSONAL_DOC_KEYWORDS);
    if (personalKw) {
      return makeResult(
        "Personal Documents", isDocument ? 87 : 70,
        `Contains personal document keyword "${personalKw}"${ext ? ` in a ${ext} file` : ""} — likely an identity or credentials document.`,
        ["personal", "identity", "document"],
        { action: "keep", reason: "Personal identity documents must be securely retained.", safe: true },
      );
    }
  }

  // -------------------------------------------------------------------
  // 8. Path-only fallbacks (lower confidence)
  // -------------------------------------------------------------------

  {
    const medKw = segmentsContainKeyword(dirSegments, MEDICAL_PATH_KEYWORDS);
    if (medKw) {
      return makeResult("Medical", 60, `File in a "${medKw}" folder — probable medical or health record.`, ["medical"], { action: "keep", reason: "Retain medical documents.", safe: true });
    }
    const renovKw = segmentsContainKeyword(dirSegments, RENOVATION_PATH_KEYWORDS);
    if (renovKw) {
      return makeResult("Renovation", 58, `File in a "${renovKw}" folder — probable renovation document.`, ["renovation"], { action: "keep", reason: "Retain renovation documents.", safe: true });
    }
    const personalKw = segmentsContainKeyword(dirSegments, ["personal", "identity", "id", "passport"]);
    if (personalKw) {
      return makeResult("Personal Documents", 55, `File in a "${personalKw}" folder — probable personal document.`, ["personal"], { action: "keep", reason: "Retain personal documents.", safe: true });
    }

    // Media path
    const mediaKw = segmentsContainKeyword(dirSegments, MEDIA_PATH_KEYWORDS);
    if (mediaKw) {
      return makeResult("Media", 62, `File in a "${mediaKw}" folder — probable media asset.`, ["media"], { action: "review", reason: "Verify whether this media is still needed.", safe: false });
    }
  }

  // -------------------------------------------------------------------
  // 9. Large file heuristic
  // -------------------------------------------------------------------

  if (type === "large_file") {
    const mb = (input.sizeBytes / (1024 * 1024)).toFixed(0);
    if (VIDEO_EXTS.has(ext) || [".iso", ".img", ".vmdk", ".vhd"].includes(ext)) {
      return makeResult(
        "Media", 78,
        `Large ${ext} file (${mb} MB) — consistent with a video export, disk image, or virtual machine.`,
        ["large-file", "media"],
        { action: "review", reason: "Large files occupy significant space; verify before removing.", safe: false },
      );
    }
    return makeResult(
      "Unknown", 45,
      `Large file (${mb} MB, ${ext || "no extension"}) — no recognisable category pattern. Manual review recommended.`,
      ["large-file"],
      { action: "review", reason: "Large files without a clear category warrant manual inspection.", safe: false },
    );
  }

  // -------------------------------------------------------------------
  // 10. Unknown — no rule matched
  // -------------------------------------------------------------------

  return makeResult(
    "Unknown", 40,
    `No category pattern recognised for "${input.name}" (${ext || "no extension"}). Manual inspection recommended.`,
    ["unknown"],
    { action: "review", reason: "File could not be automatically categorised.", safe: false },
  );
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class LocalRuleProvider implements AIProvider {
  readonly name = "local-rule";

  async classify(input: AIClassificationInput): Promise<AIClassificationResult> {
    return classify(input);
  }

  isAvailable(): boolean {
    return true; // Always available — no external dependency
  }
}
