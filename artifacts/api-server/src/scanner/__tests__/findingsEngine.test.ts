import { describe, it, expect } from "vitest";
import { classifyFile, classifyEmptyFolder, classifyDuplicate } from "../findingsEngine.js";

// ---------------------------------------------------------------------------
// classifyFile
// ---------------------------------------------------------------------------

describe("classifyFile", () => {
  it("returns null for an ordinary file below the size threshold", () => {
    expect(classifyFile("/tmp/notes.txt", "notes.txt", 500)).toBeNull();
  });

  it("returns null for a regular file well below the default large-file threshold", () => {
    expect(classifyFile("/docs/readme.md", "readme.md", 50 * 1024)).toBeNull();
  });

  // ── zero-byte ────────────────────────────────────────────────────────────

  it("classifies a zero-byte file as zero_byte with safe_delete status", () => {
    const result = classifyFile("/tmp/ghost.log", "ghost.log", 0);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("zero_byte");
    expect(result!.findingStatus).toBe("safe_delete");
    expect(result!.sizeBytes).toBe(0);
  });

  it("includes a descriptive reason for zero-byte files", () => {
    const result = classifyFile("/tmp/empty.txt", "empty.txt", 0);
    expect(result!.reason).toMatch(/empty|0 bytes/i);
  });

  // ── Adobe InDesign lock (.idlk) ──────────────────────────────────────────

  it("classifies .idlk files as idlk_file with safe_delete", () => {
    const result = classifyFile("/design/doc.idlk", "doc.idlk", 4096);
    expect(result!.type).toBe("idlk_file");
    expect(result!.findingStatus).toBe("safe_delete");
    expect(result!.extension).toBe(".idlk");
  });

  // ── generic lock (.locked) ───────────────────────────────────────────────

  it("classifies .locked files as locked_file requiring review", () => {
    const result = classifyFile("/data/archive.locked", "archive.locked", 1024);
    expect(result!.type).toBe("locked_file");
    expect(result!.findingStatus).toBe("review");
  });

  // ── installers ───────────────────────────────────────────────────────────

  it.each([".dmg", ".exe", ".msi", ".pkg", ".deb", ".rpm"])(
    "classifies %s as installer with review status",
    (ext) => {
      const result = classifyFile(`/downloads/setup${ext}`, `setup${ext}`, 50 * 1024 * 1024);
      expect(result?.type).toBe("installer");
      expect(result?.findingStatus).toBe("review");
    }
  );

  // ── archives ─────────────────────────────────────────────────────────────

  it.each([".zip", ".tar", ".gz", ".rar", ".7z"])(
    "classifies %s as archive with review status",
    (ext) => {
      const result = classifyFile(`/backup/archive${ext}`, `archive${ext}`, 10 * 1024 * 1024);
      expect(result?.type).toBe("archive");
      expect(result?.findingStatus).toBe("review");
    }
  );

  // ── large files ───────────────────────────────────────────────────────────

  it("classifies a file over the default 100 MB threshold as large_file", () => {
    const result = classifyFile("/media/video.mov", "video.mov", 200 * 1024 * 1024);
    expect(result!.type).toBe("large_file");
    expect(result!.findingStatus).toBe("review");
    expect(result!.reason).toMatch(/MB/);
  });

  it("respects a custom largeFileBytes threshold", () => {
    const threshold = 1024 * 1024; // 1 MB
    const result = classifyFile("/tmp/report.pdf", "report.pdf", 2 * threshold, threshold);
    expect(result!.type).toBe("large_file");
  });

  it("does not flag a file under a custom threshold", () => {
    const threshold = 10 * 1024 * 1024; // 10 MB
    const result = classifyFile("/tmp/small.mp4", "small.mp4", 5 * 1024 * 1024, threshold);
    expect(result).toBeNull();
  });

  // ── metadata preservation ─────────────────────────────────────────────────

  it("preserves path, name, and extension on the returned finding", () => {
    const result = classifyFile("/usr/share/data.locked", "data.locked", 100);
    expect(result!.path).toBe("/usr/share/data.locked");
    expect(result!.name).toBe("data.locked");
    expect(result!.extension).toBe(".locked");
  });

  it("infers the extension from the file name", () => {
    const result = classifyFile("/tmp/file.IDLK", "file.IDLK", 100);
    // extension is lowercased by classifyFile
    expect(result!.extension).toBe(".idlk");
    expect(result!.type).toBe("idlk_file");
  });
});

// ---------------------------------------------------------------------------
// classifyEmptyFolder
// ---------------------------------------------------------------------------

describe("classifyEmptyFolder", () => {
  it("returns an empty_folder finding with safe_delete status", () => {
    const result = classifyEmptyFolder("/home/user/OldProject");
    expect(result.type).toBe("empty_folder");
    expect(result.findingStatus).toBe("safe_delete");
    expect(result.sizeBytes).toBe(0);
    expect(result.extension).toBe("");
  });

  it("extracts the folder basename from the path as the name", () => {
    const result = classifyEmptyFolder("/a/b/c/EmptyDir");
    expect(result.name).toBe("EmptyDir");
    expect(result.path).toBe("/a/b/c/EmptyDir");
  });

  it("handles a root-level folder path", () => {
    const result = classifyEmptyFolder("/EmptyAtRoot");
    expect(result.name).toBe("EmptyAtRoot");
  });
});

// ---------------------------------------------------------------------------
// classifyDuplicate
// ---------------------------------------------------------------------------

describe("classifyDuplicate", () => {
  const HASH = "deadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678";

  it("returns a finding with type duplicate and findingStatus duplicate", () => {
    const result = classifyDuplicate("/photos/img.jpg", "img.jpg", ".jpg", 4 * 1024 * 1024, HASH);
    expect(result.type).toBe("duplicate");
    expect(result.findingStatus).toBe("duplicate");
  });

  it("attaches the SHA-256 hash to both hash and duplicateGroupHash fields", () => {
    const result = classifyDuplicate("/photos/img.jpg", "img.jpg", ".jpg", 1024, HASH);
    expect(result.hash).toBe(HASH);
    expect(result.duplicateGroupHash).toBe(HASH);
  });

  it("includes the first 8 hex characters of the hash in the reason", () => {
    const result = classifyDuplicate("/a/b.txt", "b.txt", ".txt", 100, HASH);
    expect(result.reason).toContain("deadbeef");
  });

  it("preserves sizeBytes on the returned finding", () => {
    const result = classifyDuplicate("/media/vid.mp4", "vid.mp4", ".mp4", 500 * 1024 * 1024, HASH);
    expect(result.sizeBytes).toBe(500 * 1024 * 1024);
  });

  it("preserves path, name, and extension", () => {
    const result = classifyDuplicate("/docs/report.pdf", "report.pdf", ".pdf", 2048, HASH);
    expect(result.path).toBe("/docs/report.pdf");
    expect(result.name).toBe("report.pdf");
    expect(result.extension).toBe(".pdf");
  });
});
