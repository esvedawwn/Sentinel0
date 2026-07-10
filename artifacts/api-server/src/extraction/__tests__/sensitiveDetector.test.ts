import { describe, it, expect } from "vitest";
import { detectSensitiveCategories } from "../sensitiveDetector.js";

describe("detectSensitiveCategories", () => {
  it("detects legal content", () => {
    expect(detectSensitiveCategories("This Agreement is entered into by Plaintiff and Defendant.")).toContain("legal");
  });

  it("detects banking content via account number keyword", () => {
    expect(detectSensitiveCategories("Please wire funds using this Account Number: 12345")).toContain("banking");
  });

  it("detects a credit-card-like number", () => {
    expect(detectSensitiveCategories("Card: 4111 1111 1111 1111")).toContain("banking");
  });

  it("detects medical content", () => {
    expect(detectSensitiveCategories("Patient diagnosis confirmed by physician.")).toContain("medical");
  });

  it("detects identity content via SSN pattern", () => {
    expect(detectSensitiveCategories("SSN: 123-45-6789")).toContain("identity");
  });

  it("detects API keys", () => {
    expect(detectSensitiveCategories("api_key: sk-abcdefghijklmnopqrstuvwx")).toContain("api_key");
  });

  it("detects passwords", () => {
    expect(detectSensitiveCategories("password: hunter2")).toContain("password");
  });

  it("detects private key blocks", () => {
    expect(detectSensitiveCategories("-----BEGIN RSA PRIVATE KEY-----\nMIIB...")).toContain("private_key");
  });

  it("returns no categories for benign text", () => {
    expect(detectSensitiveCategories("Just a regular grocery list: milk, eggs, bread.")).toEqual([]);
  });
});
