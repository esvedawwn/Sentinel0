import { describe, it, expect } from "vitest";
import {
  sanitiseScanInput,
  checkNotSystemPath,
  isWithinApprovedRoot,
  validateAgainstApprovedRoots,
  validateScanStart,
} from "../pathSafety.js";

// ── sanitiseScanInput ──────────────────────────────────────────────────────────

describe("sanitiseScanInput", () => {
  it("accepts a clean absolute path", () => {
    const result = sanitiseScanInput("/Users/alice/Documents");
    expect(result.ok).toBe(true);
    if (result.ok) expect((result as { ok: true; value: string }).value).toBe("/Users/alice/Documents");
  });

  it("trims surrounding whitespace", () => {
    const result = sanitiseScanInput("  /Users/alice/Downloads  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect((result as { ok: true; value: string }).value).toBe("/Users/alice/Downloads");
  });

  it("rejects an empty path", () => {
    const result = sanitiseScanInput("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it("rejects a whitespace-only path", () => {
    const result = sanitiseScanInput("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it("rejects path traversal with ..", () => {
    const result = sanitiseScanInput("/Users/alice/../../etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects pure traversal sequence", () => {
    const result = sanitiseScanInput("../../etc/shadow");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/traversal|absolute/i);
  });

  it("rejects relative paths", () => {
    const result = sanitiseScanInput("Documents/Projects");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/absolute/i);
  });

  it("rejects paths with null bytes", () => {
    const result = sanitiseScanInput("/Users/alice\0/secret");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/null byte/i);
  });

  it("rejects overly long paths", () => {
    const longPath = "/" + "a".repeat(4097);
    const result = sanitiseScanInput(longPath);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/length/i);
  });
});

// ── checkNotSystemPath ─────────────────────────────────────────────────────────

describe("checkNotSystemPath", () => {
  it("allows a normal home directory path", () => {
    expect(checkNotSystemPath("/Users/alice/Documents").ok).toBe(true);
  });

  it("allows the Downloads folder", () => {
    expect(checkNotSystemPath("/Users/alice/Downloads").ok).toBe(true);
  });

  it("blocks /System on macOS", () => {
    const result = checkNotSystemPath("/System");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/protected/i);
  });

  it("blocks /System/Library/CoreServices", () => {
    const result = checkNotSystemPath("/System/Library/CoreServices");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/protected/i);
  });

  it("blocks /private/etc", () => {
    expect(checkNotSystemPath("/private/etc").ok).toBe(false);
  });

  it("blocks /private/var", () => {
    expect(checkNotSystemPath("/private/var").ok).toBe(false);
  });

  it("blocks /usr", () => {
    expect(checkNotSystemPath("/usr").ok).toBe(false);
  });

  it("blocks /usr/local (child of /usr)", () => {
    expect(checkNotSystemPath("/usr/local").ok).toBe(false);
  });

  it("blocks /dev", () => {
    expect(checkNotSystemPath("/dev").ok).toBe(false);
  });

  it("blocks /proc (Linux)", () => {
    expect(checkNotSystemPath("/proc").ok).toBe(false);
  });

  it("blocks /etc (Linux)", () => {
    expect(checkNotSystemPath("/etc").ok).toBe(false);
  });

  it("blocks /bin", () => {
    expect(checkNotSystemPath("/bin").ok).toBe(false);
  });

  it("blocks /Library/Frameworks", () => {
    expect(checkNotSystemPath("/Library/Frameworks").ok).toBe(false);
  });

  it("allows /Library/Application Support (user data, not in block list)", () => {
    expect(checkNotSystemPath("/Library/Application Support").ok).toBe(true);
  });
});

// ── isWithinApprovedRoot ───────────────────────────────────────────────────────

describe("isWithinApprovedRoot", () => {
  const roots = ["/Users/alice/Documents", "/Users/alice/Desktop"];

  it("accepts a path equal to an approved root", () => {
    expect(isWithinApprovedRoot("/Users/alice/Documents", roots)).toBe(true);
  });

  it("accepts a child path inside an approved root", () => {
    expect(isWithinApprovedRoot("/Users/alice/Documents/Projects/foo.txt", roots)).toBe(true);
  });

  it("accepts a child of the second approved root", () => {
    expect(isWithinApprovedRoot("/Users/alice/Desktop/screenshot.png", roots)).toBe(true);
  });

  it("rejects a path that shares a prefix but is not a child", () => {
    // /Users/alice/Documents2 is NOT inside /Users/alice/Documents
    expect(isWithinApprovedRoot("/Users/alice/Documents2", roots)).toBe(false);
  });

  it("rejects a completely unrelated path", () => {
    expect(isWithinApprovedRoot("/Users/bob/Downloads", roots)).toBe(false);
  });

  it("rejects when approved roots list is empty", () => {
    expect(isWithinApprovedRoot("/Users/alice/Documents", [])).toBe(false);
  });
});

// ── validateAgainstApprovedRoots ───────────────────────────────────────────────

describe("validateAgainstApprovedRoots", () => {
  const roots = ["/Users/alice/Documents"];

  it("returns ok for a path within an approved root", () => {
    const result = validateAgainstApprovedRoots("/Users/alice/Documents/report.pdf", roots);
    expect(result.ok).toBe(true);
  });

  it("returns error when no approved roots are configured", () => {
    const result = validateAgainstApprovedRoots("/Users/alice/Documents", []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no approved scan roots/i);
  });

  it("returns error when path is outside approved roots", () => {
    const result = validateAgainstApprovedRoots("/Users/bob/secret", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not within any approved/i);
  });
});

// ── validateScanStart ──────────────────────────────────────────────────────────

describe("validateScanStart", () => {
  const roots = ["/Users/alice/Documents"];

  it("accepts a valid path inside an approved root", () => {
    const result = validateScanStart("/Users/alice/Documents", roots);
    expect(result.ok).toBe(true);
  });

  it("rejects path traversal before checking roots", () => {
    const result = validateScanStart("/Users/alice/../../etc", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects system paths", () => {
    const result = validateScanStart("/System/Library", ["/System"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/protected/i);
  });

  it("rejects path outside approved roots even if valid absolute path", () => {
    const result = validateScanStart("/Users/bob/Downloads", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not within any approved/i);
  });

  it("rejects empty approved roots for a real scan attempt", () => {
    const result = validateScanStart("/Users/alice/Documents", []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no approved scan roots/i);
  });
});
