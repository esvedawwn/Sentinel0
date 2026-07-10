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
});
