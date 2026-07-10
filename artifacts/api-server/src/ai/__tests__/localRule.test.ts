import { describe, it, expect } from "vitest";
import { classifyLocalRule } from "../providers/localRule.js";
import type { AIClassificationInput } from "../types.js";

function input(overrides: Partial<AIClassificationInput>): AIClassificationInput {
  return {
    path: "/sample-data/file.txt",
    name: "file.txt",
    extension: ".txt",
    sizeBytes: 1024,
    findingType: "none",
    ...overrides,
  };
}

describe("classifyLocalRule", () => {
  it("classifies zero-byte files as Temporary Files, safe to delete", () => {
    const result = classifyLocalRule(input({ findingType: "zero_byte", name: "ghost.txt", path: "/a/ghost.txt" }));
    expect(result.category).toBe("Temporary Files");
    expect(result.recommendation.action).toBe("delete");
    expect(result.recommendation.safe).toBe(true);
    expect(result.recommendation.requiresConfirmation).toBe(true);
  });

  it("classifies .idlk files as Lock Files", () => {
    const result = classifyLocalRule(input({ findingType: "idlk_file", name: "doc.idlk", extension: ".idlk", path: "/a/doc.idlk" }));
    expect(result.category).toBe("Lock Files");
    expect(result.subcategory).toBe("Adobe InDesign lock");
  });

  it("classifies duplicate finding type as Duplicate Candidates", () => {
    const result = classifyLocalRule(input({ findingType: "duplicate", name: "copy.pdf", extension: ".pdf", path: "/a/copy.pdf" }));
    expect(result.category).toBe("Duplicate Candidates");
    expect(result.recommendation.safe).toBe(false);
  });

  it("classifies installer finding type as Installers", () => {
    const result = classifyLocalRule(input({ findingType: "installer", name: "setup.dmg", extension: ".dmg", path: "/downloads/setup.dmg", sizeBytes: 50 * 1024 * 1024 }));
    expect(result.category).toBe("Installers");
  });

  it("classifies filenames with 'invoice' as Invoices", () => {
    const result = classifyLocalRule(input({ name: "invoice-march.pdf", extension: ".pdf", path: "/docs/invoice-march.pdf" }));
    expect(result.category).toBe("Invoices");
    expect(result.suggestedDestination).toBe("Documents/Invoices");
  });

  it("classifies filenames with 'tax' as Tax, not Banking", () => {
    const result = classifyLocalRule(input({ name: "tax-return-2025.pdf", extension: ".pdf", path: "/docs/tax-return-2025.pdf" }));
    expect(result.category).toBe("Tax");
  });

  it("classifies screenshots by filename pattern", () => {
    const result = classifyLocalRule(input({ name: "Screenshot 2025-01-01 at 10.00.00.png", extension: ".png", path: "/desktop/Screenshot 2025-01-01 at 10.00.00.png" }));
    expect(result.category).toBe("Screenshots");
  });

  it("classifies RAW camera files as Photography with a subcategory", () => {
    const result = classifyLocalRule(input({ name: "IMG_0001.CR2", extension: ".cr2", path: "/photos/IMG_0001.CR2" }));
    expect(result.category).toBe("Photography");
    expect(result.subcategory).toBe("RAW original");
    expect(result.recommendation.action).toBe("keep");
  });

  it("classifies package.json as Web Development", () => {
    const result = classifyLocalRule(input({ name: "package.json", extension: ".json", path: "/project/package.json" }));
    expect(result.category).toBe("Web Development");
  });

  it("falls back to Unknown when nothing matches", () => {
    const result = classifyLocalRule(input({ name: "mystery.xyz", extension: ".xyz", path: "/misc/mystery.xyz" }));
    expect(result.category).toBe("Unknown");
    expect(result.recommendation.action).toBe("review");
  });

  it("never marks a recommendation as executable without confirmation", () => {
    const cases = [
      input({ findingType: "zero_byte" }),
      input({ findingType: "installer", extension: ".dmg" }),
      input({ name: "contract.pdf", extension: ".pdf", path: "/legal/contract.pdf" }),
    ];
    for (const c of cases) {
      const result = classifyLocalRule(c);
      expect(result.recommendation.requiresConfirmation).toBe(true);
    }
  });

  describe("confidence scoring", () => {
    it("clamps confidence to the 0-100 range", () => {
      const result = classifyLocalRule(input({ findingType: "zero_byte" }));
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it("assigns higher confidence to strong finding-type signals than to weak path-only hints", () => {
      const strong = classifyLocalRule(input({ findingType: "duplicate", name: "copy.pdf", path: "/a/copy.pdf" }));
      const weak = classifyLocalRule(input({ name: "clip.xyz", extension: ".xyz", path: "/home/videos/clip.xyz" }));
      expect(strong.confidence).toBeGreaterThan(weak.confidence);
    });

    it("gives a document keyword match higher confidence than a path-only keyword match for the same category", () => {
      const docMatch = classifyLocalRule(input({ name: "legal-contract.pdf", extension: ".pdf", path: "/misc/legal-contract.pdf" }));
      const pathOnlyMatch = classifyLocalRule(input({ name: "notes", extension: "", path: "/legal/notes" }));
      expect(docMatch.category).toBe("Legal");
      expect(pathOnlyMatch.category).toBe("Legal");
      expect(docMatch.confidence).toBeGreaterThan(pathOnlyMatch.confidence);
    });

    it("gives the Unknown fallback a low confidence score", () => {
      const result = classifyLocalRule(input({ name: "mystery.xyz", extension: ".xyz", path: "/misc/mystery.xyz" }));
      expect(result.confidence).toBeLessThan(50);
    });
  });

  describe("semantic tags", () => {
    it("attaches relevant tags for a duplicate finding", () => {
      const result = classifyLocalRule(input({ findingType: "duplicate", name: "copy.pdf", path: "/a/copy.pdf" }));
      expect(result.tags).toEqual(expect.arrayContaining(["duplicate", "review"]));
    });

    it("attaches extension-derived tags for media files", () => {
      const result = classifyLocalRule(input({ name: "clip.mp4", extension: ".mp4", path: "/videos/clip.mp4" }));
      expect(result.tags).toEqual(expect.arrayContaining(["video", "mp4"]));
    });

    it("attaches a category-slug tag for keyword-matched documents", () => {
      const result = classifyLocalRule(input({ name: "invoice-march.pdf", extension: ".pdf", path: "/docs/invoice-march.pdf" }));
      expect(result.tags).toEqual(expect.arrayContaining(["invoices", "document"]));
    });

    it("never returns an empty tag list", () => {
      const cases = [
        input({ findingType: "zero_byte" }),
        input({ name: "mystery.xyz", extension: ".xyz", path: "/misc/mystery.xyz" }),
        input({ name: "IMG_0001.CR2", extension: ".cr2", path: "/photos/IMG_0001.CR2" }),
      ];
      for (const c of cases) {
        expect(classifyLocalRule(c).tags.length).toBeGreaterThan(0);
      }
    });
  });

  describe("suggested destinations", () => {
    it("suggests a documents subfolder for keyword-matched document categories", () => {
      const result = classifyLocalRule(input({ name: "medical-report.pdf", extension: ".pdf", path: "/docs/medical-report.pdf" }));
      expect(result.suggestedDestination).toBe("Documents/Medical");
    });

    it("suggests Pictures/Screenshots for screenshots", () => {
      const result = classifyLocalRule(input({ name: "Screenshot 2025-01-01 at 10.00.00.png", extension: ".png", path: "/desktop/Screenshot 2025-01-01 at 10.00.00.png" }));
      expect(result.suggestedDestination).toBe("Pictures/Screenshots");
    });

    it("returns null suggestedDestination for files with no natural single-folder home (e.g. lock files, installers)", () => {
      const lock = classifyLocalRule(input({ findingType: "idlk_file", name: "doc.idlk", extension: ".idlk", path: "/a/doc.idlk" }));
      const installer = classifyLocalRule(input({ findingType: "installer", name: "setup.dmg", extension: ".dmg", path: "/downloads/setup.dmg" }));
      expect(lock.suggestedDestination).toBeNull();
      expect(installer.suggestedDestination).toBeNull();
    });

    it("suggests Design/Branding for branded vector assets", () => {
      const result = classifyLocalRule(input({ name: "brand-logo.svg", extension: ".svg", path: "/assets/brand-logo.svg" }));
      expect(result.suggestedDestination).toBe("Design/Branding");
    });
  });

  describe("suggested actions", () => {
    it("provides a non-empty, human-readable suggested action string for every result", () => {
      const cases = [
        input({ findingType: "zero_byte" }),
        input({ findingType: "duplicate", name: "copy.pdf", path: "/a/copy.pdf" }),
        input({ name: "mystery.xyz", extension: ".xyz", path: "/misc/mystery.xyz" }),
      ];
      for (const c of cases) {
        const result = classifyLocalRule(c);
        expect(typeof result.suggestedAction).toBe("string");
        expect(result.suggestedAction.length).toBeGreaterThan(0);
      }
    });

    it("frames a safe-to-delete recommendation's suggested action in cautious, non-destructive language", () => {
      const result = classifyLocalRule(input({ findingType: "zero_byte" }));
      expect(result.recommendation.safe).toBe(true);
      expect(result.suggestedAction.toLowerCase()).toContain("safe to delete");
    });

    it("frames a review recommendation's suggested action without asserting deletion is safe", () => {
      const result = classifyLocalRule(input({ findingType: "archive", extension: ".zip", name: "backup.zip", path: "/a/backup.zip" }));
      expect(result.recommendation.safe).toBe(false);
      expect(result.suggestedAction.toLowerCase()).not.toContain("safe to delete");
    });
  });
});
