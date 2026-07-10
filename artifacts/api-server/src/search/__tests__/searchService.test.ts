import { describe, it, expect } from "vitest";
import { buildFilters, shouldFallbackToPlainText, filtersToWhereClause } from "../searchService.js";

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
});

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
});

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
});
