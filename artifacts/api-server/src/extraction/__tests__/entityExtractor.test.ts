import { describe, it, expect } from "vitest";
import { extractEntities } from "../entityExtractor.js";

describe("extractEntities", () => {
  it("extracts dates", () => {
    const entities = extractEntities("Signed on 2024-05-01 by both parties.");
    expect(entities.some((e) => e.type === "date" && e.value === "2024-05-01")).toBe(true);
  });

  it("extracts invoice numbers", () => {
    const entities = extractEntities("Invoice #INV-2024-0091 is due on receipt.");
    expect(entities.some((e) => e.type === "invoice_number")).toBe(true);
  });

  it("extracts case references", () => {
    const entities = extractEntities("Case No. CV-2024-1123 was filed last week.");
    expect(entities.some((e) => e.type === "case_reference")).toBe(true);
  });

  it("extracts dollar amounts", () => {
    const entities = extractEntities("Total due: $1,250.00 within 30 days.");
    expect(entities.some((e) => e.type === "amount" && e.value === "$1,250.00")).toBe(true);
  });

  it("extracts organizations", () => {
    const entities = extractEntities("This agreement is between Acme Corp. and the client.");
    expect(entities.some((e) => e.type === "organization" && e.value.includes("Acme"))).toBe(true);
  });

  it("extracts person names without misclassifying organizations as people", () => {
    const entities = extractEntities("John Smith signed on behalf of Acme Corp.");
    expect(entities.some((e) => e.type === "person" && e.value === "John Smith")).toBe(true);
    expect(entities.filter((e) => e.type === "person" && e.value.includes("Acme"))).toHaveLength(0);
  });
});
