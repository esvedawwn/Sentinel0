import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("getAIStatus (diagnostics)", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDINGS_API_KEY;
    delete process.env.AI_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("cloud AI is disabled by default: reports local/offline mode with cloudEnabled false when no keys are set", async () => {
    const { getAIStatus } = await import("../status.js");
    const { resetProvider } = await import("../classifier.js");
    resetProvider();

    const status = getAIStatus();
    expect(status.status).toBe("local");
    expect(status.provider).toBe("local-rule");
    expect(status.cloudEnabled).toBe(false);
  });

  it("reports cloudEnabled true and cloud status once an API key is configured", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    const { getAIStatus } = await import("../status.js");
    const { resetProvider } = await import("../classifier.js");
    resetProvider();

    const status = getAIStatus();
    expect(status.cloudEnabled).toBe(true);
    expect(status.status).toBe("cloud");
    expect(status.provider).toBe("openai");
  });

  it("exposes providerAvailability for every registered provider", async () => {
    const { getAIStatus } = await import("../status.js");
    const { resetProvider } = await import("../classifier.js");
    resetProvider();

    const status = getAIStatus();
    expect(status.providerAvailability).toEqual({
      local: true,
      openai: false,
      embeddings: false,
    });
  });

  it("surfaces the last provider error after a fallback occurs", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    const { getAIStatus } = await import("../status.js");
    const { classifyWithAI, resetProvider } = await import("../classifier.js");
    resetProvider();

    expect(getAIStatus().lastError).toBeNull();

    await classifyWithAI({ path: "/a/x.txt", name: "x.txt", extension: ".txt", sizeBytes: 1, findingType: "none" });

    expect(getAIStatus().lastError).toMatch(/not yet implemented/);
  });

  it("surfaces classification duration after a classification has run", async () => {
    const { getAIStatus } = await import("../status.js");
    const { classifyWithAI, resetProvider } = await import("../classifier.js");
    resetProvider();

    expect(getAIStatus().lastClassificationDurationMs).toBeNull();

    await classifyWithAI({ path: "/a/x.txt", name: "x.txt", extension: ".txt", sizeBytes: 1, findingType: "none" });

    expect(getAIStatus().lastClassificationDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("never reports a cloud provider name when no API key is configured (no accidental cloud activation)", async () => {
    const { getAIStatus } = await import("../status.js");
    const { resetProvider } = await import("../classifier.js");
    resetProvider();

    const status = getAIStatus();
    expect(status.provider).not.toBe("openai");
    expect(status.provider).not.toBe("embeddings");
  });
});
