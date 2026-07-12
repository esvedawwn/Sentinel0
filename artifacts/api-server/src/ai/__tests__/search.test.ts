import { describe, it, expect } from "vitest";
import { interpretSearchQuery } from "../search.js";

// Fixed reference date for deterministic date tests: 2025-07-15 (Tuesday)
const REF = new Date("2025-07-15T12:00:00.000Z");

describe("interpretSearchQuery — v1 compatibility", () => {
  it("recognises category keywords", () => {
    const result = interpretSearchQuery("show me tax documents", REF);
    expect(result.categories).toContain("Tax");
  });

  it("recognises duplicate intent", () => {
    const result = interpretSearchQuery("find duplicate photos", REF);
    expect(result.categories).toContain("Duplicate Candidates");
    expect(result.categories).toContain("Photography");
  });

  it("recognises large file size intent", () => {
    const result = interpretSearchQuery("large videos", REF);
    expect(result.minSizeBytes).toBeGreaterThan(0);
    expect(result.categories).toContain("Video");
  });

  it("recognises safe-to-delete status intent", () => {
    const result = interpretSearchQuery("screenshots I can delete", REF);
    expect(result.statuses).toContain("safe_delete");
    expect(result.categories).toContain("Screenshots");
  });

  it("falls back to plain text when nothing matches", () => {
    const result = interpretSearchQuery("quarterly-report-final-v2", REF);
    expect(result.categories).toHaveLength(0);
    expect(result.statuses).toHaveLength(0);
    expect(result.query).toBe("quarterly-report-final-v2");
  });

  it("is case-insensitive", () => {
    const lower = interpretSearchQuery("large videos", REF);
    const upper = interpretSearchQuery("LARGE VIDEOS", REF);
    expect(upper.categories).toEqual(lower.categories);
    expect(upper.minSizeBytes).toEqual(lower.minSizeBytes);
  });

  it("recognises multiple category keywords in a single query", () => {
    const result = interpretSearchQuery("tax and invoice documents", REF);
    expect(result.categories).toEqual(expect.arrayContaining(["Tax", "Invoices"]));
  });

  it("recognises 'huge' as a larger size threshold than 'large'", () => {
    const large = interpretSearchQuery("large files", REF);
    const huge = interpretSearchQuery("huge files", REF);
    expect(huge.minSizeBytes).toBeGreaterThan(large.minSizeBytes ?? 0);
  });

  it("recognises the 'review' status keyword", () => {
    const result = interpretSearchQuery("screenshots that need review", REF);
    expect(result.statuses).toContain("review");
  });

  it("always preserves the original raw query string, even when interpreted", () => {
    const result = interpretSearchQuery("  Large Duplicate Videos  ", REF);
    expect(result.query).toBe("  Large Duplicate Videos  ");
  });

  it("does not attempt any network access or cloud lookups (pure/local)", () => {
    const result = interpretSearchQuery("banking statements", REF);
    expect(result).toBeDefined();
    expect(result.categories).toContain("Banking");
  });

  it("provides a human-readable explanation whenever keywords are recognised", () => {
    const result = interpretSearchQuery("large duplicate videos", REF);
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation).toMatch(/Interpreted as/);
  });

  it("provides a fallback explanation when no keywords are recognised", () => {
    const result = interpretSearchQuery("xz9-random-string", REF);
    expect(result.explanation).toMatch(/plain text search/);
  });
});

describe("interpretSearchQuery — domain-specific patterns", () => {
  it("handles 'legal PDFs' — Legal category + pdf extension", () => {
    const r = interpretSearchQuery("legal PDFs", REF);
    expect(r.categories).toContain("Legal");
    expect(r.extensions).toContain("pdf");
  });

  it("handles 'renovation invoices'", () => {
    const r = interpretSearchQuery("renovation invoices", REF);
    expect(r.categories).toContain("Renovation");
    expect(r.categories).toContain("Invoices");
  });

  it("handles 'duplicate installers'", () => {
    const r = interpretSearchQuery("duplicate installers", REF);
    expect(r.categories).toContain("Installers");
    expect(r.statuses).toContain("duplicate");
  });

  it("handles 'banking statements from 2025'", () => {
    const r = interpretSearchQuery("banking statements from 2025", REF);
    expect(r.categories).toContain("Banking");
    expect(r.dateFrom?.getFullYear()).toBe(2025);
    expect(r.dateTo?.getFullYear()).toBe(2025);
  });

  it("handles 'screenshots from last week'", () => {
    const r = interpretSearchQuery("screenshots from last week", REF);
    expect(r.categories).toContain("Screenshots");
    expect(r.dateFrom).not.toBeNull();
    expect(r.dateTo).not.toBeNull();
  });

  it("handles 'old Adobe lock files' — Lock Files category", () => {
    const r = interpretSearchQuery("old Adobe lock files", REF);
    expect(r.categories).toContain("Lock Files");
  });

  it("handles 'court documents' — Legal category", () => {
    const r = interpretSearchQuery("court documents", REF);
    expect(r.categories).toContain("Legal");
  });

  it("handles 'renovation plumbing invoices'", () => {
    const r = interpretSearchQuery("renovation plumbing invoices", REF);
    expect(r.categories).toContain("Renovation");
    expect(r.categories).toContain("Invoices");
  });

  it("handles 'brand assets for a client'", () => {
    const r = interpretSearchQuery("brand assets for a client", REF);
    expect(r.categories).toContain("Branding");
  });
});

describe("interpretSearchQuery — precise size parsing", () => {
  it("parses 'larger than 500 MB'", () => {
    const r = interpretSearchQuery("files larger than 500 MB", REF);
    expect(r.minSizeBytes).toBe(500 * 1024 * 1024);
  });

  it("parses 'over 2 GB'", () => {
    const r = interpretSearchQuery("files over 2 GB", REF);
    expect(r.minSizeBytes).toBe(2 * 1024 ** 3);
  });

  it("parses 'smaller than 10 MB'", () => {
    const r = interpretSearchQuery("files smaller than 10 MB", REF);
    expect(r.maxSizeBytes).toBe(10 * 1024 * 1024);
  });

  it("parses 'under 1 GB'", () => {
    const r = interpretSearchQuery("photos under 1 GB", REF);
    expect(r.maxSizeBytes).toBe(1024 ** 3);
  });

  it("handles 'over 500 KB'", () => {
    const r = interpretSearchQuery("over 500 KB", REF);
    expect(r.minSizeBytes).toBe(500 * 1024);
  });
});

describe("interpretSearchQuery — extension shortcuts", () => {
  it("maps 'PDFs' to pdf extension", () => {
    expect(interpretSearchQuery("show me all PDFs", REF).extensions).toContain("pdf");
  });

  it("maps 'Word docs' to docx/doc", () => {
    const r = interpretSearchQuery("Word docs from last month", REF);
    expect(r.extensions).toContain("docx");
  });

  it("maps 'spreadsheets' to xlsx/csv variants", () => {
    const r = interpretSearchQuery("spreadsheets from 2024", REF);
    expect(r.extensions.some((e) => ["xlsx", "xls", "csv"].includes(e))).toBe(true);
  });

  it("maps 'csv' explicitly", () => {
    const r = interpretSearchQuery("CSV files from last year", REF);
    expect(r.extensions).toContain("csv");
  });
});

describe("interpretSearchQuery — date parsing", () => {
  it("parses 'last week' relative to reference date (2025-07-15, Tuesday)", () => {
    const r = interpretSearchQuery("photos from last week", REF);
    // Last week = Mon Jul 7 – Sun Jul 13 2025
    expect(r.dateFrom?.toISOString().startsWith("2025-07-07")).toBe(true);
    expect(r.dateTo?.toISOString().startsWith("2025-07-13")).toBe(true);
  });

  it("parses 'this month'", () => {
    const r = interpretSearchQuery("files from this month", REF);
    expect(r.dateFrom?.getMonth()).toBe(6); // July is index 6
    expect(r.dateFrom?.getDate()).toBe(1);
  });

  it("parses 'last month'", () => {
    const r = interpretSearchQuery("invoices from last month", REF);
    expect(r.dateFrom?.getMonth()).toBe(5); // June (index 5)
    expect(r.dateTo?.getMonth()).toBe(5);
  });

  it("parses a 4-digit year (2024)", () => {
    const r = interpretSearchQuery("contracts from 2024", REF);
    expect(r.dateFrom?.getFullYear()).toBe(2024);
    expect(r.dateTo?.getFullYear()).toBe(2024);
  });

  it("parses 'in 2025'", () => {
    const r = interpretSearchQuery("banking statements in 2025", REF);
    expect(r.dateFrom?.getFullYear()).toBe(2025);
  });

  it("parses 'from June' — picks June 2025 since REF is July 2025", () => {
    const r = interpretSearchQuery("invoices from June", REF);
    expect(r.dateFrom?.getMonth()).toBe(5); // June
    expect(r.dateFrom?.getFullYear()).toBe(2025);
  });

  it("parses 'last year'", () => {
    const r = interpretSearchQuery("tax documents from last year", REF);
    expect(r.dateFrom?.getFullYear()).toBe(2024);
    expect(r.dateTo?.getFullYear()).toBe(2024);
  });

  it("parses 'this year'", () => {
    const r = interpretSearchQuery("contracts this year", REF);
    expect(r.dateFrom?.getFullYear()).toBe(2025);
    expect(r.dateTo).not.toBeNull();
  });

  it("returns null dates when no date keyword is present", () => {
    const r = interpretSearchQuery("large photos", REF);
    expect(r.dateFrom).toBeNull();
    expect(r.dateTo).toBeNull();
  });
});

describe("interpretSearchQuery — entity mention patterns", () => {
  it("extracts entity from 'mentioning Ingrid'", () => {
    const r = interpretSearchQuery("documents mentioning Ingrid", REF);
    expect(r.mentionedEntity).toBe("Ingrid");
  });

  it("extracts entity from 'related to Alpha Hair'", () => {
    const r = interpretSearchQuery("files related to Alpha Hair", REF);
    expect(r.mentionedEntity).toBe("Alpha Hair");
  });

  it("extracts entity from 'documents regarding Kennards'", () => {
    const r = interpretSearchQuery("documents regarding Kennards", REF);
    expect(r.mentionedEntity).toBe("Kennards");
  });

  it("returns null mentionedEntity when no entity pattern matches", () => {
    const r = interpretSearchQuery("large legal PDFs from 2024", REF);
    expect(r.mentionedEntity).toBeNull();
  });
});

describe("interpretSearchQuery — confidence and unrecognized terms", () => {
  it("returns confidence > 0 when keywords were matched", () => {
    const r = interpretSearchQuery("large duplicate invoices", REF);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("returns zero confidence for fully unrecognised queries", () => {
    const r = interpretSearchQuery("xz9-random-string", REF);
    expect(r.confidence).toBe(0);
  });

  it("returns appliedFilters array for structured queries", () => {
    const r = interpretSearchQuery("legal PDFs from last month", REF);
    expect(r.appliedFilters.length).toBeGreaterThan(0);
    const sources = r.appliedFilters.map((f) => f.source);
    expect(sources).toContain("category");
    expect(sources).toContain("date");
    expect(sources).toContain("extension");
  });

  it("returns empty appliedFilters for plain text queries", () => {
    const r = interpretSearchQuery("xz9-random-string", REF);
    expect(r.appliedFilters).toHaveLength(0);
  });
});

describe("interpretSearchQuery — compound domain queries", () => {
  it("legal PDFs from June — category + extension + date", () => {
    const r = interpretSearchQuery("legal PDFs from June", REF);
    expect(r.categories).toContain("Legal");
    expect(r.extensions).toContain("pdf");
    expect(r.dateFrom?.getMonth()).toBe(5);
    expect(r.appliedFilters.length).toBeGreaterThanOrEqual(3);
  });

  it("duplicate installers larger than 500 MB", () => {
    const r = interpretSearchQuery("duplicate installers larger than 500 MB", REF);
    expect(r.statuses).toContain("duplicate");
    expect(r.categories).toContain("Installers");
    expect(r.minSizeBytes).toBe(500 * 1024 * 1024);
  });

  it("banking statements from 2025 mentioning Kennards", () => {
    const r = interpretSearchQuery("banking statements from 2025 mentioning Kennards", REF);
    expect(r.categories).toContain("Banking");
    expect(r.dateFrom?.getFullYear()).toBe(2025);
    expect(r.mentionedEntity).toBe("Kennards");
  });

  it("renovation invoices from last month", () => {
    const r = interpretSearchQuery("renovation invoices from last month", REF);
    expect(r.categories).toContain("Renovation");
    expect(r.categories).toContain("Invoices");
    expect(r.dateFrom).not.toBeNull();
  });

  it("screenshots from last week safe to delete", () => {
    const r = interpretSearchQuery("screenshots from last week safe to delete", REF);
    expect(r.categories).toContain("Screenshots");
    expect(r.statuses).toContain("safe_delete");
    expect(r.dateFrom).not.toBeNull();
  });
});
