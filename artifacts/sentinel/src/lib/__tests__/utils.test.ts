import { describe, it, expect } from "vitest";
import {
  cn,
  formatBytes,
  formatTimestamp,
  formatNumber,
  statusColor,
  statusLabel,
  activityIcon,
} from "../utils";

// ---------------------------------------------------------------------------
// cn (class name merge)
// ---------------------------------------------------------------------------

describe("cn", () => {
  it("concatenates multiple class names", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("resolves Tailwind utility conflicts — last value wins", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters out falsy values", () => {
    const nope = false;
    expect(cn("foo", nope && "bar", undefined, null, "baz")).toBe("foo baz");
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe("formatBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats whole-number kilobytes without a decimal point", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats whole-number megabytes without a decimal point", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });

  it("formats whole-number gigabytes without a decimal point", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1024 ** 4)).toBe("1 TB");
  });

  it("includes one decimal place for non-whole values", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats a realistic file size: 4.2 MB", () => {
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe("formatNumber", () => {
  it("formats 0 as '0'", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats thousands with a locale separator", () => {
    // Accept either comma or period depending on the test locale
    expect(formatNumber(1000)).toMatch(/1[,.]000/);
    expect(formatNumber(1_000_000)).toMatch(/1[,.]000[,.]000/);
  });
});

// ---------------------------------------------------------------------------
// statusColor
// ---------------------------------------------------------------------------

describe("statusColor", () => {
  it("returns green (#34D399) for success states", () => {
    expect(statusColor("ready")).toBe("#34D399");
    expect(statusColor("success")).toBe("#34D399");
    expect(statusColor("completed")).toBe("#34D399");
  });

  it("returns amber (#FBBF24) for review/warning states", () => {
    expect(statusColor("review")).toBe("#FBBF24");
    expect(statusColor("warning")).toBe("#FBBF24");
  });

  it("returns red (#F87171) for error/failed/corrupted states", () => {
    expect(statusColor("action_required")).toBe("#F87171");
    expect(statusColor("error")).toBe("#F87171");
    expect(statusColor("failed")).toBe("#F87171");
    expect(statusColor("corrupted")).toBe("#F87171");
  });

  it("returns blue (#60A5FA) for in-progress states", () => {
    expect(statusColor("running")).toBe("#60A5FA");
    expect(statusColor("info")).toBe("#60A5FA");
    expect(statusColor("scanning")).toBe("#60A5FA");
  });

  it("returns a muted colour for unrecognised statuses", () => {
    expect(statusColor("unknown")).toBe("rgba(255,255,255,0.5)");
    expect(statusColor("")).toBe("rgba(255,255,255,0.5)");
  });
});

// ---------------------------------------------------------------------------
// statusLabel
// ---------------------------------------------------------------------------

describe("statusLabel", () => {
  it.each([
    ["ready", "READY"],
    ["review", "REVIEW"],
    ["action_required", "ACTION REQUIRED"],
    ["corrupted", "CORRUPTED"],
    ["running", "IN PROGRESS"],
    ["completed", "COMPLETE"],
    ["cancelled", "CANCELLED"],
    ["failed", "FAILED"],
    ["pending", "PENDING"],
    ["resolved", "RESOLVED"],
    ["ignored", "IGNORED"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(statusLabel(input)).toBe(expected);
  });

  it("uppercases unknown statuses and replaces underscores with spaces", () => {
    expect(statusLabel("custom_status")).toBe("CUSTOM STATUS");
    expect(statusLabel("new_type_flag")).toBe("NEW TYPE FLAG");
  });
});

// ---------------------------------------------------------------------------
// activityIcon
// ---------------------------------------------------------------------------

describe("activityIcon", () => {
  it.each([
    ["success", "✓"],
    ["warning", "⚠"],
    ["info", "›"],
    ["error", "✕"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(activityIcon(input)).toBe(expected);
  });

  it("returns the default icon for unrecognised activity types", () => {
    expect(activityIcon("unknown")).toBe("›");
    expect(activityIcon("")).toBe("›");
  });
});

// ---------------------------------------------------------------------------
// formatTimestamp — sanity checks (output varies by locale/timezone)
// ---------------------------------------------------------------------------

describe("formatTimestamp", () => {
  it("returns a time string (HH:MM:SS) for today's date", () => {
    const now = new Date();
    const result = formatTimestamp(now.toISOString());
    // Should match HH:MM:SS
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("returns a localised date string for a past date", () => {
    const past = new Date("2020-01-15T10:00:00Z").toISOString();
    const result = formatTimestamp(past);
    // Should not look like HH:MM:SS — it's a date label
    expect(result).not.toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(result.length).toBeGreaterThan(0);
  });
});
