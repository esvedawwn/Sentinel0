/**
 * Natural-language search interpretation.
 *
 * Converts a free-text query (e.g. "large duplicate videos", "old tax pdfs",
 * "screenshots I can delete") into structured filters the findings API can
 * apply. Uses local keyword rules only — no network access, no API key.
 *
 * This is a v1 heuristic interpreter, not a full NLP pipeline. It is
 * intentionally conservative: unmatched terms are ignored rather than
 * guessed at, and the raw query is always preserved for a plain substring
 * search fallback.
 */

import type { AICategory } from "./types.js";

export interface SearchInterpretation {
  query: string;
  categories: AICategory[];
  tags: string[];
  statuses: string[];
  minSizeBytes: number | null;
  explanation: string;
}

const CATEGORY_SYNONYMS: Array<{ category: AICategory; keywords: string[] }> = [
  { category: "Legal", keywords: ["legal", "contract", "contracts"] },
  { category: "Banking", keywords: ["bank", "banking", "financial", "finance"] },
  { category: "Tax", keywords: ["tax", "taxes"] },
  { category: "Receipts", keywords: ["receipt", "receipts"] },
  { category: "Invoices", keywords: ["invoice", "invoices", "bill", "bills"] },
  { category: "Design", keywords: ["design", "designs"] },
  { category: "Branding", keywords: ["brand", "branding", "logo", "logos"] },
  { category: "Web Development", keywords: ["web dev", "webdev", "code", "project files"] },
  { category: "Photography", keywords: ["photo", "photos", "picture", "pictures", "image", "images"] },
  { category: "Video", keywords: ["video", "videos", "movie", "movies", "clip", "clips"] },
  { category: "Audio", keywords: ["audio", "music", "song", "songs", "podcast"] },
  { category: "Renovation", keywords: ["renovation", "remodel", "construction"] },
  { category: "Property", keywords: ["property", "real estate", "mortgage"] },
  { category: "Medical", keywords: ["medical", "health", "doctor"] },
  { category: "Personal Documents", keywords: ["personal", "resume", "cv"] },
  { category: "Identity Documents", keywords: ["passport", "identity", "id card", "license", "licence"] },
  { category: "Business", keywords: ["business", "proposal", "pitch deck"] },
  { category: "Software", keywords: ["software", "code", "app"] },
  { category: "Installers", keywords: ["installer", "installers", "install", "setup files"] },
  { category: "Archives", keywords: ["archive", "archives", "zip", "zips"] },
  { category: "Screenshots", keywords: ["screenshot", "screenshots", "screen shot", "screen recording"] },
  { category: "Temporary Files", keywords: ["temp", "temporary", "junk", "cache"] },
  { category: "Lock Files", keywords: ["lock file", "lock files", ".lock"] },
  { category: "Duplicate Candidates", keywords: ["duplicate", "duplicates", "dupes", "dupe"] },
];

const SIZE_KEYWORDS: Array<{ pattern: RegExp; bytes: number }> = [
  { pattern: /\blarge\b|\bbig\b|\bhuge\b/, bytes: 100 * 1024 * 1024 },
  { pattern: /\bhuge\b/, bytes: 500 * 1024 * 1024 },
];

const STATUS_KEYWORDS: Array<{ pattern: RegExp; status: string }> = [
  { pattern: /\bsafe to delete\b|\bsafe delete\b|\bcan delete\b|\bi can delete\b/, status: "safe_delete" },
  { pattern: /\breview\b|\bneeds review\b/, status: "review" },
  { pattern: /\bduplicate\b|\bduplicates\b/, status: "duplicate" },
];

/**
 * Interpret a natural-language query into structured filters.
 * Pure function — safe to unit test without any I/O.
 */
export function interpretSearchQuery(query: string): SearchInterpretation {
  const q = query.toLowerCase().trim();

  const categories: AICategory[] = [];
  const tags: string[] = [];
  for (const { category, keywords } of CATEGORY_SYNONYMS) {
    if (keywords.some((kw) => q.includes(kw))) {
      categories.push(category);
      tags.push(category.toLowerCase().replace(/\s+/g, "-"));
    }
  }

  const statuses: string[] = [];
  for (const { pattern, status } of STATUS_KEYWORDS) {
    if (pattern.test(q) && !statuses.includes(status)) {
      statuses.push(status);
    }
  }

  let minSizeBytes: number | null = null;
  for (const { pattern, bytes } of SIZE_KEYWORDS) {
    if (pattern.test(q)) {
      minSizeBytes = Math.max(minSizeBytes ?? 0, bytes);
    }
  }

  const parts: string[] = [];
  if (categories.length > 0) parts.push(`category ${categories.join(" or ")}`);
  if (statuses.length > 0) parts.push(`status ${statuses.join(" or ")}`);
  if (minSizeBytes) parts.push(`size over ${Math.round(minSizeBytes / (1024 * 1024))} MB`);

  const explanation = parts.length > 0
    ? `Interpreted as: ${parts.join(", ")}. Falling back to plain text match for any remaining words.`
    : `No category, status, or size keywords recognised — using "${query}" as a plain text search.`;

  return { query, categories, tags, statuses, minSizeBytes, explanation };
}
