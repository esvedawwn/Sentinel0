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
});
