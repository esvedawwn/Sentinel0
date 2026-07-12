import { describe, it, expect } from "vitest";
import { buildFilters, shouldFallbackToPlainText, filtersToWhereClause, scoreFindings } from "../searchService.js";
import type { Finding } from "@workspace/db";

// ── buildFilters ──────────────────────────────────────────────────────────────

describe("buildFilters", () => {
  it("interprets a natural-language query into filters", () => {
    const { filters, explanation } = buildFilters({ q: "large duplicate videos" });
    expect(filters.category).toBe("Video");
    expect(filters.duplicatesOnly).toBe(true);
    expect(filters.minSizeBytes).toBeGreaterThan(0);
    expect(explanation).toContain("Interpreted");
  });

  it("lets explicit filters override the interpreted ones", () => {
    const { filters } = buildFilters({ q: "large duplicate videos", category: "Legal", duplicatesOnly: false });
    expect(filters.category).toBe("Legal");
    expect(filters.duplicatesOnly).toBe(false);
  });

  it("returns empty-ish filters with no query and no explicit filters", () => {
    const { filters, explanation } = buildFilters({});
    expect(filters.category).toBeNull();
    expect(filters.duplicatesOnly).toBe(false);
    expect(explanation).toContain("explicit filters only");
  });

  it("applies explicit filters even without a query", () => {
    const { filters } = buildFilters({ extension: "pdf", scanId: 3 });
    expect(filters.extension).toBe("pdf");
    expect(filters.scanId).toBe(3);
  });

  it("propagates extensions from NL interpretation (PDFs)", () => {
    const { filters } = buildFilters({ q: "legal PDFs from last month" });
    expect(filters.extensions).toContain("pdf");
  });

  it("propagates mentionedEntity from NL interpretation", () => {
    const { filters } = buildFilters({ q: "documents mentioning Kennards" });
    expect(filters.mentionedEntity).toBe("Kennards");
  });

  it("propagates dateFrom/dateTo from NL interpretation", () => {
    const { filters } = buildFilters({ q: "invoices from 2024" });
    expect(filters.dateFrom).not.toBeNull();
    expect(filters.dateTo).not.toBeNull();
    expect(filters.dateFrom).toContain("2024");
  });

  it("returns confidence > 0 for matched queries", () => {
    const { confidence } = buildFilters({ q: "large legal PDFs" });
    expect(confidence).toBeGreaterThan(0);
  });

  it("returns appliedFilters for structured queries", () => {
    const { appliedFilters } = buildFilters({ q: "legal PDFs from last month" });
    expect(appliedFilters.length).toBeGreaterThan(0);
  });

  it("returns empty appliedFilters for plain text queries", () => {
    const { appliedFilters } = buildFilters({ q: "quarterly-report-v2" });
    expect(appliedFilters).toHaveLength(0);
  });

  it("explicit mentionedEntity overrides NL interpreted one", () => {
    const { filters } = buildFilters({ q: "documents mentioning Ingrid", mentionedEntity: "Brad" });
    expect(filters.mentionedEntity).toBe("Brad");
  });

  it("explicit extensions array overrides NL interpreted extensions", () => {
    const { filters } = buildFilters({ q: "legal PDFs", extensions: ["docx"] });
    expect(filters.extensions).toEqual(["docx"]);
  });
});

// ── shouldFallbackToPlainText ─────────────────────────────────────────────────

describe("shouldFallbackToPlainText", () => {
  it("returns undefined when no query was given", () => {
    expect(shouldFallbackToPlainText(undefined, {})).toBeUndefined();
  });

  it("returns undefined when structured filters were found", () => {
    expect(shouldFallbackToPlainText("large videos", { category: "Video", minSizeBytes: 100 })).toBeUndefined();
  });

  it("falls back to the raw query when nothing structured matched", () => {
    expect(shouldFallbackToPlainText("quarterly-report-v2", {})).toBe("quarterly-report-v2");
  });

  it("returns undefined when mentionedEntity is set (structured hit)", () => {
    expect(shouldFallbackToPlainText("docs mentioning Ingrid", { mentionedEntity: "Ingrid" })).toBeUndefined();
  });

  it("returns undefined when extensions array is populated (structured hit)", () => {
    expect(shouldFallbackToPlainText("legal PDFs", { extensions: ["pdf"] })).toBeUndefined();
  });

  it("returns undefined when findingTypes is set", () => {
    expect(shouldFallbackToPlainText("duplicate installers", { findingTypes: ["installer"] })).toBeUndefined();
  });
});

// ── filtersToWhereClause ──────────────────────────────────────────────────────

describe("filtersToWhereClause", () => {
  it("returns undefined for an empty filter set with no plain text", () => {
    expect(filtersToWhereClause({})).toBeUndefined();
  });

  it("builds a clause when any filter field is set", () => {
    expect(filtersToWhereClause({ extension: "pdf" })).toBeDefined();
  });

  it("builds a clause for a plain-text fallback query alone", () => {
    expect(filtersToWhereClause({}, "invoice")).toBeDefined();
  });

  it("builds a clause for extensions array filter", () => {
    expect(filtersToWhereClause({ extensions: ["pdf", "docx"] })).toBeDefined();
  });

  it("builds a clause for findingTypes filter", () => {
    expect(filtersToWhereClause({ findingTypes: ["installer", "archive"] })).toBeDefined();
  });

  it("builds a clause for mentionedEntity filter", () => {
    expect(filtersToWhereClause({ mentionedEntity: "Kennards" })).toBeDefined();
  });

  it("builds a clause for duplicatesOnly", () => {
    expect(filtersToWhereClause({ duplicatesOnly: true })).toBeDefined();
  });

  it("ignores empty mentionedEntity", () => {
    expect(filtersToWhereClause({ mentionedEntity: "" })).toBeUndefined();
  });
});

// ── scoreFindings ─────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 1,
    scanId: 1,
    type: "large_file",
    path: "/Users/test/Documents/invoice-2024.pdf",
    name: "invoice-2024.pdf",
    extension: "pdf",
    sizeBytes: 1024 * 1024,
    hash: null,
    duplicateGroupId: null,
    duplicateGroupHash: null,
    findingStatus: "review",
    riskLevel: "medium",
    reviewStatus: "new",
    reviewedAt: null,
    reason: "Large file",
    fileCreatedAt: null,
    fileModifiedAt: null,
    createdAt: new Date(),
    aiCategory: "Invoices",
    aiSubcategory: null,
    aiConfidence: 95,
    aiExplanation: null,
    aiTags: ["invoice", "2024"],
    aiSuggestedDestination: null,
    aiSuggestedAction: null,
    aiProvider: "local-rule",
    ...overrides,
  };
}

describe("scoreFindings", () => {
  it("returns findings with relevanceScore, matchedFactors, and matchExplanation", () => {
    const findings = [makeFinding()];
    const scored = scoreFindings(findings, "invoice", {});
    expect(scored[0].relevanceScore).toBeGreaterThan(0);
    expect(scored[0].matchedFactors).toBeDefined();
    expect(scored[0].matchExplanation).toBeDefined();
    expect(typeof scored[0].matchExplanation).toBe("string");
  });

  it("exact filename match scores higher than partial match", () => {
    const exact = makeFinding({ name: "invoice", q: undefined } as Partial<Finding>);
    const partial = makeFinding({ name: "quarterly-invoice-summary.pdf" });
    const scored = scoreFindings([exact, partial], "invoice", {});
    expect(scored[0].relevanceScore).toBeGreaterThanOrEqual(scored[1].relevanceScore);
  });

  it("filename match scores higher than path-only match", () => {
    const nameMatch = makeFinding({ name: "invoice.pdf", path: "/Documents/invoice.pdf" });
    const pathOnly = makeFinding({ name: "document.pdf", path: "/Invoices/document.pdf" });
    const scored = scoreFindings([pathOnly, nameMatch], "invoice", {});
    // nameMatch should rank first
    expect(scored[0].name).toBe("invoice.pdf");
  });

  it("results are sorted by relevanceScore descending", () => {
    const highMatch = makeFinding({ name: "invoice.pdf" });
    const lowMatch = makeFinding({ name: "other.pdf", path: "/other/invoice/folder/file.pdf" });
    const scored = scoreFindings([lowMatch, highMatch], "invoice", {});
    expect(scored[0].relevanceScore).toBeGreaterThanOrEqual(scored[1].relevanceScore);
  });

  it("every result has relevanceScore in [0,1]", () => {
    const findings = [makeFinding(), makeFinding({ name: "random.doc", path: "/tmp/random.doc" })];
    const scored = scoreFindings(findings, "invoice", {});
    for (const s of scored) {
      expect(s.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(s.relevanceScore).toBeLessThanOrEqual(1);
    }
  });

  it("returns all original finding fields on scored results", () => {
    const f = makeFinding({ id: 42 });
    const [scored] = scoreFindings([f], "invoice", {});
    expect(scored.id).toBe(42);
    expect(scored.name).toBe(f.name);
    expect(scored.aiCategory).toBe(f.aiCategory);
  });

  it("empty query still returns results with base score", () => {
    const findings = [makeFinding()];
    const scored = scoreFindings(findings, undefined, {});
    expect(scored.length).toBe(1);
    expect(scored[0].relevanceScore).toBeGreaterThan(0);
  });

  it("aiCategory match adds to score", () => {
    const f = makeFinding({ aiCategory: "Legal" });
    const scored = scoreFindings([f], "legal documents", { aiCategory: "Legal" });
    expect(scored[0].matchedFactors.some((mf) => mf.toLowerCase().includes("category"))).toBe(true);
  });

  it("duplicate status match adds to score when duplicatesOnly is true", () => {
    const f = makeFinding({ type: "duplicate" });
    const scored = scoreFindings([f], "duplicate", { duplicatesOnly: true });
    expect(scored[0].matchedFactors.some((mf) => mf.includes("duplicate"))).toBe(true);
  });

  it("matchExplanation mentions aiCategory when present", () => {
    const f = makeFinding({ aiCategory: "Invoices" });
    const [scored] = scoreFindings([f], "", {});
    expect(scored.matchExplanation).toContain("Invoices");
  });
});
