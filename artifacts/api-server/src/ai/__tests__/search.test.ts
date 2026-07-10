import { describe, it, expect } from "vitest";
import { interpretSearchQuery } from "../search.js";

describe("interpretSearchQuery", () => {
  it("recognises category keywords", () => {
    const result = interpretSearchQuery("show me tax documents");
    expect(result.categories).toContain("Tax");
  });

  it("recognises duplicate intent", () => {
    const result = interpretSearchQuery("find duplicate photos");
    expect(result.categories).toContain("Duplicate Candidates");
    expect(result.categories).toContain("Photography");
  });

  it("recognises large file size intent", () => {
    const result = interpretSearchQuery("large videos");
    expect(result.minSizeBytes).toBeGreaterThan(0);
    expect(result.categories).toContain("Video");
  });

  it("recognises safe-to-delete status intent", () => {
    const result = interpretSearchQuery("screenshots I can delete");
    expect(result.statuses).toContain("safe_delete");
    expect(result.categories).toContain("Screenshots");
  });

  it("falls back to plain text when nothing matches", () => {
    const result = interpretSearchQuery("quarterly-report-final-v2");
    expect(result.categories).toHaveLength(0);
    expect(result.statuses).toHaveLength(0);
    expect(result.query).toBe("quarterly-report-final-v2");
  });

  describe("natural-language query interpretation", () => {
    it("is case-insensitive", () => {
      const lower = interpretSearchQuery("large videos");
      const upper = interpretSearchQuery("LARGE VIDEOS");
      expect(upper.categories).toEqual(lower.categories);
      expect(upper.minSizeBytes).toEqual(lower.minSizeBytes);
    });

    it("recognises multiple category keywords in a single query", () => {
      const result = interpretSearchQuery("tax and invoice documents");
      expect(result.categories).toEqual(expect.arrayContaining(["Tax", "Invoices"]));
    });

    it("recognises 'huge' as a larger size threshold than 'large'", () => {
      const large = interpretSearchQuery("large files");
      const huge = interpretSearchQuery("huge files");
      expect(huge.minSizeBytes).toBeGreaterThan(large.minSizeBytes ?? 0);
    });

    it("recognises the 'review' status keyword", () => {
      const result = interpretSearchQuery("screenshots that need review");
      expect(result.statuses).toContain("review");
    });

    it("always preserves the original raw query string, even when interpreted", () => {
      const result = interpretSearchQuery("  Large Duplicate Videos  ");
      expect(result.query).toBe("  Large Duplicate Videos  ");
    });

    it("does not attempt any network access or cloud lookups (pure/local, returns synchronously)", () => {
      const result = interpretSearchQuery("banking statements");
      expect(result).toBeDefined();
      expect(result.categories).toContain("Banking");
    });

    it("provides a human-readable explanation whenever keywords are recognised", () => {
      const result = interpretSearchQuery("large duplicate videos");
      expect(result.explanation.length).toBeGreaterThan(0);
      expect(result.explanation).toMatch(/Interpreted as/);
    });

    it("provides a fallback explanation when no keywords are recognised", () => {
      const result = interpretSearchQuery("xz9-random-string");
      expect(result.explanation).toMatch(/plain text search/);
    });
  });
});
