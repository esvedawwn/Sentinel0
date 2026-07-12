/**
 * Natural-language search interpretation — v2.
 *
 * Converts a free-text query into structured filters the findings API can
 * apply. Remains 100 % local: no network access, no API key, works offline.
 *
 * What's new in v2 (over v1):
 *  - Relative and absolute date parsing ("last week", "from June", "in 2025")
 *  - Precise size expressions ("larger than 500 MB", "over 2 GB")
 *  - Extension shortcuts ("PDFs", "Word docs", "spreadsheets")
 *  - Entity-mention patterns ("mentioning Ingrid", "related to Alpha Hair")
 *  - Finding-type shortcuts ("lock files", "installers", "archives")
 *  - Confidence score and unrecognised-term reporting
 *  - Structured appliedFilters[] array for UI chip display
 */

import type { AICategory } from "./types.js";

// ── Output types ──────────────────────────────────────────────────────────────

export interface AppliedFilter {
  label: string;
  value: string;
  source: "category" | "size" | "date" | "status" | "extension" | "entity" | "type";
}

export interface SearchInterpretation {
  query: string;
  categories: AICategory[];
  tags: string[];
  statuses: string[];
  findingTypes: string[];
  extensions: string[];
  minSizeBytes: number | null;
  maxSizeBytes: number | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  mentionedEntity: string | null;
  explanation: string;
  confidence: number;
  unrecognizedTerms: string[];
  appliedFilters: AppliedFilter[];
}

// ── Category synonyms ─────────────────────────────────────────────────────────

const CATEGORY_SYNONYMS: Array<{ category: AICategory; keywords: string[] }> = [
  { category: "Legal", keywords: ["legal", "contract", "contracts", "court", "solicitor", "barrister", "case", "litigation", "plaintiff", "defendant", "writ", "summons", "affidavit", "subpoena"] },
  { category: "Banking", keywords: ["bank", "banking", "financial", "finance", "statement", "statements", "bsb", "account", "transaction"] },
  { category: "Tax", keywords: ["tax", "taxes", "ato", "tax return", "bas", "gst", "income tax", "deductions"] },
  { category: "Receipts", keywords: ["receipt", "receipts", "purchase", "purchases"] },
  { category: "Invoices", keywords: ["invoice", "invoices", "bill", "bills", "billing", "payable", "remittance"] },
  { category: "Design", keywords: ["design", "designs", "mockup", "wireframe", "figma"] },
  { category: "Branding", keywords: ["brand", "branding", "logo", "logos", "identity"] },
  { category: "Web Development", keywords: ["web dev", "webdev", "project files", "codebase"] },
  { category: "Photography", keywords: ["photo", "photos", "picture", "pictures", "photograph", "photographs", "shoot", "shoots"] },
  { category: "Video", keywords: ["video", "videos", "movie", "movies", "clip", "clips", "footage", "film", "recording"] },
  { category: "Audio", keywords: ["audio", "music", "song", "songs", "podcast", "recording", "track"] },
  { category: "Renovation", keywords: ["renovation", "renovations", "reno", "remodel", "construction", "building", "plumbing", "electrical", "tiling", "builder"] },
  { category: "Property", keywords: ["property", "real estate", "mortgage", "lease", "tenancy", "rental", "landlord"] },
  { category: "Medical", keywords: ["medical", "health", "doctor", "hospital", "prescription", "pathology", "radiology"] },
  { category: "Personal Documents", keywords: ["personal", "resume", "cv", "curriculum vitae", "reference letter"] },
  { category: "Identity Documents", keywords: ["passport", "identity", "id card", "license", "licence", "birth certificate", "citizenship"] },
  { category: "Business", keywords: ["business", "proposal", "pitch deck", "strategy", "plan"] },
  { category: "Software", keywords: ["software", "app", "application"] },
  { category: "Installers", keywords: ["installer", "installers", "install", "setup files"] },
  { category: "Archives", keywords: ["archive", "archives", "zip", "zips", "compressed"] },
  { category: "Screenshots", keywords: ["screenshot", "screenshots", "screen shot", "screen recording", "screen cap", "screencap"] },
  { category: "Temporary Files", keywords: ["temp", "temporary", "junk", "cache", "tmp"] },
  { category: "Lock Files", keywords: ["lock file", "lock files", ".lock", "adobe lock"] },
  { category: "Duplicate Candidates", keywords: ["duplicate", "duplicates", "dupes", "dupe", "copy", "copies"] },
];

// ── Finding type shortcuts ────────────────────────────────────────────────────

const FINDING_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: "zero_byte", keywords: ["zero byte", "zero-byte", "empty files", "0 byte", "0-byte"] },
  { type: "large_file", keywords: ["large files", "big files", "large file", "big file"] },
  { type: "archive", keywords: ["archive", "archives", "zip files", "compressed files"] },
  { type: "installer", keywords: ["installer", "installers", "pkg files", "dmg files", "exe files"] },
  { type: "idlk_file", keywords: ["lock file", "lock files", "idlk", "adobe lock"] },
  { type: "duplicate", keywords: ["duplicate", "duplicates", "dupes", "dupe"] },
  { type: "empty_folder", keywords: ["empty folder", "empty folders", "empty directory"] },
];

// ── Extension shortcuts ───────────────────────────────────────────────────────

const EXTENSION_SHORTCUTS: Array<{ pattern: RegExp; extensions: string[]; label: string }> = [
  { pattern: /\bpdfs?\b/, extensions: ["pdf"], label: "PDF" },
  { pattern: /\bword[\s-]?docs?\b|\bdocx?\b|\b\.docx?\b/, extensions: ["docx", "doc"], label: "Word doc" },
  { pattern: /\bspreadsheets?\b|\bexcel\b|\bxlsx?\b|\b\.xlsx?\b/, extensions: ["xlsx", "xls", "csv"], label: "spreadsheet" },
  { pattern: /\bpowerpoints?\b|\bpptx?\b|\bslides?\b/, extensions: ["pptx", "ppt"], label: "presentation" },
  { pattern: /\b(?:jpeg|jpg|png|gif|webp|heic)\b/, extensions: ["jpg", "jpeg", "png", "gif", "webp", "heic"], label: "image" },
  { pattern: /\b(?:mp4|mov|avi|mkv)\b/, extensions: ["mp4", "mov", "avi", "mkv"], label: "video file" },
  { pattern: /\b(?:mp3|m4a|wav|flac|aac)\b/, extensions: ["mp3", "m4a", "wav", "flac"], label: "audio file" },
  { pattern: /\b(?:zip|tar|gz|rar|7z)\b/, extensions: ["zip", "tar", "gz", "rar", "7z"], label: "archive" },
  { pattern: /\bcsv\b/, extensions: ["csv"], label: "CSV" },
  { pattern: /\bjson\b/, extensions: ["json"], label: "JSON" },
  { pattern: /\bmarkdown\b|\b\.md\b/, extensions: ["md"], label: "Markdown" },
];

// ── Size parsing ──────────────────────────────────────────────────────────────

const SIZE_UNITS: Record<string, number> = {
  b: 1, byte: 1, bytes: 1,
  kb: 1024, kilobyte: 1024, kilobytes: 1024, k: 1024,
  mb: 1024 ** 2, megabyte: 1024 ** 2, megabytes: 1024 ** 2, m: 1024 ** 2,
  gb: 1024 ** 3, gigabyte: 1024 ** 3, gigabytes: 1024 ** 3, g: 1024 ** 3,
  tb: 1024 ** 4, terabyte: 1024 ** 4, terabytes: 1024 ** 4,
};

const SIZE_GT_PATTERN = /\b(?:larger|bigger|more|over|greater|above)\s+than\s+([\d.,]+)\s*(tb|gb|mb|kb|b|terabytes?|gigabytes?|megabytes?|kilobytes?|bytes?|[tgmk])\b/i;
const SIZE_LT_PATTERN = /\b(?:smaller|less|under|below)\s+than\s+([\d.,]+)\s*(tb|gb|mb|kb|b|terabytes?|gigabytes?|megabytes?|kilobytes?|bytes?|[tgmk])\b/i;
const SIZE_OVER_PATTERN = /\bover\s+([\d.,]+)\s*(tb|gb|mb|kb|b|terabytes?|gigabytes?|megabytes?|kilobytes?|bytes?|[tgmk])\b/i;
const SIZE_UNDER_PATTERN = /\bunder\s+([\d.,]+)\s*(tb|gb|mb|kb|b|terabytes?|gigabytes?|megabytes?|kilobytes?|bytes?|[tgmk])\b/i;

const SIZE_KEYWORD_TABLE: Array<{ pattern: RegExp; bytes: number }> = [
  { pattern: /\bhuge\b/, bytes: 500 * 1024 * 1024 },
  { pattern: /\blarge\b|\bbig\b/, bytes: 100 * 1024 * 1024 },
];

function parseSize(amount: string, unit: string): number {
  const num = parseFloat(amount.replace(/,/g, ""));
  const multiplier = SIZE_UNITS[unit.toLowerCase().replace(/s$/, "").trim()] ?? SIZE_UNITS[unit.toLowerCase().trim()] ?? 1;
  return Math.round(num * multiplier);
}

function parseSizeFilters(q: string): { minSizeBytes: number | null; maxSizeBytes: number | null } {
  let minSizeBytes: number | null = null;
  let maxSizeBytes: number | null = null;

  for (const p of [SIZE_GT_PATTERN, SIZE_OVER_PATTERN]) {
    const m = q.match(p);
    if (m) {
      minSizeBytes = Math.max(minSizeBytes ?? 0, parseSize(m[1], m[2]));
    }
  }
  for (const p of [SIZE_LT_PATTERN, SIZE_UNDER_PATTERN]) {
    const m = q.match(p);
    if (m) {
      maxSizeBytes = Math.min(maxSizeBytes ?? Infinity, parseSize(m[1], m[2]));
      if (maxSizeBytes === Infinity) maxSizeBytes = null;
    }
  }

  if (minSizeBytes === null) {
    for (const { pattern, bytes } of SIZE_KEYWORD_TABLE) {
      if (pattern.test(q)) minSizeBytes = Math.max(minSizeBytes ?? 0, bytes);
    }
  }

  return { minSizeBytes, maxSizeBytes };
}

// ── Status keywords ───────────────────────────────────────────────────────────

const STATUS_KEYWORDS: Array<{ pattern: RegExp; status: string }> = [
  { pattern: /\bsafe to delete\b|\bsafe[\s-]delete\b|\bcan delete\b|\bi can delete\b/, status: "safe_delete" },
  { pattern: /\breview\b|\bneeds review\b|\bto review\b/, status: "review" },
  { pattern: /\bduplicate\b|\bduplicates\b|\bdupes?\b/, status: "duplicate" },
];

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function parseDateRange(q: string, now: Date): { dateFrom: Date | null; dateTo: Date | null; dateLabel: string | null } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  // "last week"
  if (/\blast\s+week\b/.test(q)) {
    const monday = new Date(now);
    monday.setDate(date - ((now.getDay() + 6) % 7) - 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { dateFrom: startOfDay(monday), dateTo: endOfDay(sunday), dateLabel: "last week" };
  }

  // "this week"
  if (/\bthis\s+week\b/.test(q)) {
    const monday = new Date(now);
    monday.setDate(date - ((now.getDay() + 6) % 7));
    return { dateFrom: startOfDay(monday), dateTo: endOfDay(now), dateLabel: "this week" };
  }

  // "last month"
  if (/\blast\s+month\b/.test(q)) {
    const firstOfLast = new Date(year, month - 1, 1);
    const lastOfLast = new Date(year, month, 0);
    return { dateFrom: startOfDay(firstOfLast), dateTo: endOfDay(lastOfLast), dateLabel: "last month" };
  }

  // "this month"
  if (/\bthis\s+month\b/.test(q)) {
    return { dateFrom: startOfDay(new Date(year, month, 1)), dateTo: endOfDay(now), dateLabel: "this month" };
  }

  // "last year"
  if (/\blast\s+year\b/.test(q)) {
    return {
      dateFrom: startOfDay(new Date(year - 1, 0, 1)),
      dateTo: endOfDay(new Date(year - 1, 11, 31)),
      dateLabel: `${year - 1}`,
    };
  }

  // "this year"
  if (/\bthis\s+year\b/.test(q)) {
    return { dateFrom: startOfDay(new Date(year, 0, 1)), dateTo: endOfDay(now), dateLabel: `${year}` };
  }

  // "in 2024" / "from 2024" / "2024"  (4-digit year)
  const yearMatch = q.match(/\b(?:in|from|during)?\s*(20\d{2}|19\d{2})\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return {
      dateFrom: startOfDay(new Date(y, 0, 1)),
      dateTo: endOfDay(new Date(y, 11, 31)),
      dateLabel: `${y}`,
    };
  }

  // "from June" / "in June" (named month, no year — pick closest past occurrence)
  const monthPattern = new RegExp(`\\b(?:from|in|during)?\\s*(${Object.keys(MONTH_MAP).join("|")})\\b`, "i");
  const monthMatch = q.match(monthPattern);
  if (monthMatch) {
    const mIdx = MONTH_MAP[monthMatch[1].toLowerCase()];
    if (mIdx !== undefined) {
      let mYear = year;
      if (mIdx > month) mYear = year - 1;
      const firstOfMonth = new Date(mYear, mIdx, 1);
      const lastOfMonth = new Date(mYear, mIdx + 1, 0);
      const monthName = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase();
      return { dateFrom: startOfDay(firstOfMonth), dateTo: endOfDay(lastOfMonth), dateLabel: `${monthName} ${mYear}` };
    }
  }

  // "today"
  if (/\btoday\b/.test(q)) {
    return { dateFrom: startOfDay(now), dateTo: endOfDay(now), dateLabel: "today" };
  }

  // "yesterday"
  if (/\byesterday\b/.test(q)) {
    const y = new Date(now);
    y.setDate(date - 1);
    return { dateFrom: startOfDay(y), dateTo: endOfDay(y), dateLabel: "yesterday" };
  }

  return { dateFrom: null, dateTo: null, dateLabel: null };
}

// ── Entity mention patterns ───────────────────────────────────────────────────

const ENTITY_PATTERNS: Array<{ pattern: RegExp; group: number }> = [
  { pattern: /\bmentioning\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)(?:\s+(?:and|or|from|in|at)\b|$)/i, group: 1 },
  { pattern: /\brelated\s+to\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)(?:\s+(?:and|or|from|in|at)\b|$)/i, group: 1 },
  { pattern: /\bdocuments?\s+(?:about|for)\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)(?:\s+(?:and|or|from|in|at)\b|$)/i, group: 1 },
  { pattern: /\bregarding\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)(?:\s+(?:and|or|from|in|at)\b|$)/i, group: 1 },
  { pattern: /\bfiles?\s+(?:for|about)\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)(?:\s+(?:and|or|from|in|at)\b|$)/i, group: 1 },
  { pattern: /\beverything\s+(?:for|about|related\s+to)\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)(?:\s+(?:and|or|from|in|at)\b|$)/i, group: 1 },
];

function parseEntityMention(q: string): string | null {
  for (const { pattern, group } of ENTITY_PATTERNS) {
    const m = q.match(pattern);
    if (m?.[group]) return m[group].trim();
  }
  return null;
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function computeConfidence(signals: number, queryWordCount: number): number {
  if (queryWordCount === 0) return 0;
  const base = Math.min(signals / queryWordCount, 1);
  return parseFloat(base.toFixed(2));
}

// ── Main interpreter ──────────────────────────────────────────────────────────

/**
 * Interpret a natural-language query into structured filters.
 *
 * @param query  Raw user input.
 * @param now    Reference date for relative expressions (defaults to Date.now).
 *               Inject a fixed date in tests for deterministic results.
 */
export function interpretSearchQuery(query: string, now: Date = new Date()): SearchInterpretation {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  const categories: AICategory[] = [];
  const tags: string[] = [];
  const appliedFilters: AppliedFilter[] = [];
  let signalsMatched = 0;

  // ── Categories
  for (const { category, keywords } of CATEGORY_SYNONYMS) {
    if (keywords.some((kw) => q.includes(kw))) {
      if (!categories.includes(category)) {
        categories.push(category);
        tags.push(category.toLowerCase().replace(/\s+/g, "-"));
        appliedFilters.push({ label: "Category", value: category, source: "category" });
        signalsMatched++;
      }
    }
  }

  // ── Finding types
  const findingTypes: string[] = [];
  for (const { type, keywords } of FINDING_TYPE_KEYWORDS) {
    if (keywords.some((kw) => q.includes(kw))) {
      if (!findingTypes.includes(type)) {
        findingTypes.push(type);
        signalsMatched++;
      }
    }
  }

  // ── Statuses
  const statuses: string[] = [];
  for (const { pattern, status } of STATUS_KEYWORDS) {
    if (pattern.test(q) && !statuses.includes(status)) {
      statuses.push(status);
      appliedFilters.push({ label: "Status", value: status.replace(/_/g, " "), source: "status" });
      signalsMatched++;
    }
  }

  // ── Sizes
  const { minSizeBytes, maxSizeBytes } = parseSizeFilters(q);
  if (minSizeBytes !== null) {
    const label = `≥ ${formatBytesApprox(minSizeBytes)}`;
    appliedFilters.push({ label: "Min size", value: label, source: "size" });
    signalsMatched++;
  }
  if (maxSizeBytes !== null) {
    const label = `≤ ${formatBytesApprox(maxSizeBytes)}`;
    appliedFilters.push({ label: "Max size", value: label, source: "size" });
    signalsMatched++;
  }

  // ── Extensions
  const extensions: string[] = [];
  for (const { pattern, extensions: exts, label } of EXTENSION_SHORTCUTS) {
    if (pattern.test(q)) {
      for (const ext of exts) {
        if (!extensions.includes(ext)) extensions.push(ext);
      }
      appliedFilters.push({ label: "Extension", value: label, source: "extension" });
      signalsMatched++;
    }
  }

  // ── Dates
  const { dateFrom, dateTo, dateLabel } = parseDateRange(q, now);
  if (dateLabel) {
    appliedFilters.push({ label: "Date", value: dateLabel, source: "date" });
    signalsMatched++;
  }

  // ── Entity mentions — use original (non-lowercased) query to preserve capitalisation
  const mentionedEntity = parseEntityMention(query.trim());
  if (mentionedEntity) {
    appliedFilters.push({ label: "Mentions", value: mentionedEntity, source: "entity" });
    signalsMatched++;
  }

  // ── Explanation
  const parts: string[] = [];
  if (categories.length > 0) parts.push(`category "${categories.join(" or ")}"`);
  if (findingTypes.length > 0) parts.push(`type "${findingTypes.join(" or ")}"`);
  if (statuses.length > 0) parts.push(`status "${statuses.join(" or ")}"`);
  if (minSizeBytes) parts.push(`size ≥ ${formatBytesApprox(minSizeBytes)}`);
  if (maxSizeBytes) parts.push(`size ≤ ${formatBytesApprox(maxSizeBytes)}`);
  if (extensions.length > 0) parts.push(`extension .${extensions[0]}`);
  if (dateLabel) parts.push(`modified ${dateLabel}`);
  if (mentionedEntity) parts.push(`entity "${mentionedEntity}"`);

  const explanation =
    parts.length > 0
      ? `Interpreted as: ${parts.join(", ")}. Falling back to plain text match for any remaining words.`
      : `No category, status, or size keywords recognised — using "${query}" as a plain text search.`;

  // ── Unrecognised terms (rough heuristic: words not covered by matched patterns)
  const matchedWords = new Set<string>();
  for (const { category, keywords } of CATEGORY_SYNONYMS) {
    if (categories.includes(category)) {
      for (const kw of keywords) kw.split(/\s+/).forEach((w) => matchedWords.add(w));
    }
  }
  for (const stopword of ["from", "in", "the", "of", "a", "an", "and", "or", "to", "for",
    "files", "file", "documents", "document", "photos", "photos", "show", "me", "find",
    "search", "get", "all", "my", "any", "some", "with", "that", "are", "is", "was", "were",
    "have", "had", "been", "do", "does", "did", "modified", "created", "about", "related"]) {
    matchedWords.add(stopword);
  }
  for (const { keywords } of FINDING_TYPE_KEYWORDS) {
    for (const kw of keywords) kw.split(/\s+/).forEach((w) => matchedWords.add(w));
  }
  if (dateLabel) ["last", "this", "week", "month", "year", "yesterday", "today", "june", "july",
    "jan", "feb", "mar", "apr", "may", "aug", "sep", "oct", "nov", "dec"].forEach((w) => matchedWords.add(w));
  if (mentionedEntity) ["mentioning", "related", "regarding", "everything", "about", "for", ...mentionedEntity.toLowerCase().split(/\s+/)].forEach((w) => matchedWords.add(w));
  if (minSizeBytes || maxSizeBytes) ["larger", "bigger", "over", "more", "than", "smaller", "less", "under", "mb", "gb", "kb", "tb"].forEach((w) => matchedWords.add(w));

  const unrecognizedTerms = words.filter((w) => w.length >= 3 && !matchedWords.has(w) && !/^\d+$/.test(w));

  return {
    query,
    categories,
    tags,
    statuses,
    findingTypes,
    extensions,
    minSizeBytes,
    maxSizeBytes,
    dateFrom,
    dateTo,
    mentionedEntity,
    explanation,
    confidence: computeConfidence(signalsMatched, Math.max(words.length, 1)),
    unrecognizedTerms,
    appliedFilters,
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatBytesApprox(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
