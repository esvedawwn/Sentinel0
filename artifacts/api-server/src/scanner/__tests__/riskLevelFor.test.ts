import { describe, it, expect } from "vitest";
import { riskLevelFor } from "../realScanner.js";

describe("riskLevelFor", () => {
  it("marks empty folders and zero-byte files as low risk", () => {
    expect(riskLevelFor({ type: "empty_folder", findingStatus: "review" })).toBe("low");
    expect(riskLevelFor({ type: "zero_byte", findingStatus: "review" })).toBe("low");
  });

  it("marks anything already flagged safe_delete as low risk", () => {
    expect(riskLevelFor({ type: "large_file", findingStatus: "safe_delete" })).toBe("low");
  });

  it("marks large files, duplicates, installers, and archives as medium risk", () => {
    expect(riskLevelFor({ type: "large_file", findingStatus: "review" })).toBe("medium");
    expect(riskLevelFor({ type: "duplicate", findingStatus: "review" })).toBe("medium");
    expect(riskLevelFor({ type: "installer", findingStatus: "review" })).toBe("medium");
    expect(riskLevelFor({ type: "archive", findingStatus: "review" })).toBe("medium");
  });

  it("marks lock files as high risk", () => {
    expect(riskLevelFor({ type: "locked_file", findingStatus: "review" })).toBe("high");
    expect(riskLevelFor({ type: "idlk_file", findingStatus: "review" })).toBe("high");
  });

  it("defaults to low risk for unrecognised combinations", () => {
    expect(riskLevelFor({ type: "unknown_type" as never, findingStatus: "review" })).toBe("low");
  });
});
