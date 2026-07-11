import { describe, it, expect } from "vitest";
import { CANDIDATE_THRESHOLD } from "../projectService.js";

// ────────────────────────────────────────────────────────────────────────────
// Pure-function tests extracted from projectService internals
// ────────────────────────────────────────────────────────────────────────────

// These helpers are duplicated here so we don't have to export them from the
// service module just for tests. Any change in the service must be reflected here.

function folderDepth(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function commonPrefixLength(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function computeFolderProximity(pathA: string, pathB: string): number {
  const a = folderDepth(pathA);
  const b = folderDepth(pathB);
  if (a.length === 0 || b.length === 0) return 0;
  const common = commonPrefixLength(a, b);
  return common / Math.min(a.length, b.length);
}

function tokenizeFilename(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .split(/[\s\-_.]+/)
      .filter((t) => t.length >= 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function dateProximityScore(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  const diffDays = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) return 1;
  if (diffDays <= 7) return 0.8;
  if (diffDays <= 30) return 0.5;
  if (diffDays <= 90) return 0.2;
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────

describe("folderProximity", () => {
  it("same folder → 1.0", () => {
    expect(computeFolderProximity("/projects/acme/brand", "/projects/acme/brand")).toBe(1.0);
  });

  it("one folder apart → partial score", () => {
    const score = computeFolderProximity("/projects/acme/brand", "/projects/acme/invoices");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it("completely different paths → 0", () => {
    const score = computeFolderProximity("/home/a", "/work/b");
    expect(score).toBe(0);
  });

  it("empty paths → 0", () => {
    expect(computeFolderProximity("", "")).toBe(0);
  });
});

describe("jaccardSimilarity (filename tokens)", () => {
  it("identical filenames → 1.0", () => {
    const a = tokenizeFilename("invoice-2024-01.pdf");
    const b = tokenizeFilename("invoice-2024-01.pdf");
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("court matter files share tokens", () => {
    const a = tokenizeFilename("Henderson-court-brief.pdf");
    const b = tokenizeFilename("Henderson-court-schedule.docx");
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.3);
  });

  it("completely different filenames → 0", () => {
    const a = tokenizeFilename("invoice.pdf");
    const b = tokenizeFilename("photo.jpg");
    expect(jaccardSimilarity(a, b)).toBe(0);
  });
});

describe("dateProximityScore", () => {
  it("same day → 1.0", () => {
    const d = new Date("2024-06-15");
    expect(dateProximityScore(d, d)).toBe(1.0);
  });

  it("within 7 days → 0.8", () => {
    const a = new Date("2024-06-15");
    const b = new Date("2024-06-20");
    expect(dateProximityScore(a, b)).toBe(0.8);
  });

  it("within 30 days → 0.5", () => {
    const a = new Date("2024-06-01");
    const b = new Date("2024-06-25");
    expect(dateProximityScore(a, b)).toBe(0.5);
  });

  it("more than 90 days → 0", () => {
    const a = new Date("2024-01-01");
    const b = new Date("2024-12-31");
    expect(dateProximityScore(a, b)).toBe(0);
  });

  it("null dates → 0", () => {
    expect(dateProximityScore(null, new Date())).toBe(0);
    expect(dateProximityScore(null, null)).toBe(0);
  });
});

describe("CANDIDATE_THRESHOLD", () => {
  it("is a reasonable value between 0.2 and 0.7", () => {
    expect(CANDIDATE_THRESHOLD).toBeGreaterThanOrEqual(0.2);
    expect(CANDIDATE_THRESHOLD).toBeLessThanOrEqual(0.7);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Example query semantics (ensure tokenization works for domain queries)
// ────────────────────────────────────────────────────────────────────────────

describe("domain example queries — tokenization coverage", () => {
  const examples = [
    "documents related to a court matter",
    "renovation plumbing invoices",
    "brand files for a client",
    "correspondence about a particular company",
  ];

  it("each example query produces meaningful tokens", () => {
    for (const q of examples) {
      const tokens = tokenizeFilename(q);
      // After stopword removal, at least one substantive token should remain
      // (tokenizeFilename doesn't strip stopwords — just tests tokenization)
      expect(tokens.size).toBeGreaterThan(0);
    }
  });

  it("plumbing and renovation share no tokens with court matter", () => {
    const plumbing = tokenizeFilename("renovation plumbing invoices");
    const court = tokenizeFilename("court matter legal documents");
    expect(jaccardSimilarity(plumbing, court)).toBe(0);
  });

  it("brand files and client share a token", () => {
    const a = tokenizeFilename("brand files client presentation");
    const b = tokenizeFilename("client brand logo guidelines");
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.3);
  });
});
