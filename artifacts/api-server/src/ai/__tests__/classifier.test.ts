import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("classifier (provider selection, fallback, diagnostics)", () => {
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

  it("AI-disabled behaviour: with no API keys set, defaults to the local provider", async () => {
    const { activeProviderName, resetProvider } = await import("../classifier.js");
    resetProvider();
    expect(activeProviderName()).toBe("local-rule");
  });

  it("missing API key behaviour: cloud providers report unavailable when their key is absent", async () => {
    const { OpenAIProvider } = await import("../providers/openai.js");
    const { EmbeddingsProvider } = await import("../providers/embeddings.js");
    expect(new OpenAIProvider().isAvailable()).toBe(false);
    expect(new EmbeddingsProvider().isAvailable()).toBe(false);
  });

  it("missing API key behaviour: calling classify() on a cloud provider without a key throws rather than silently succeeding", async () => {
    const { OpenAIProvider } = await import("../providers/openai.js");
    const provider = new OpenAIProvider();
    await expect(
      provider.classify({ path: "/a/b.txt", name: "b.txt", extension: ".txt", sizeBytes: 10, findingType: "none" })
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("selects OpenAIProvider when OPENAI_API_KEY is set", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    const { activeProviderName, resetProvider } = await import("../classifier.js");
    resetProvider();
    expect(activeProviderName()).toBe("openai");
  });

  it("prefers EmbeddingsProvider over OpenAIProvider when both keys are set", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    process.env.EMBEDDINGS_API_KEY = "test-key-not-a-real-secret";
    const { activeProviderName, resetProvider } = await import("../classifier.js");
    resetProvider();
    expect(activeProviderName()).toBe("embeddings");
  });

  it("AI_PROVIDER override selects local even when a cloud key is present", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    process.env.AI_PROVIDER = "local";
    const { activeProviderName, resetProvider } = await import("../classifier.js");
    resetProvider();
    expect(activeProviderName()).toBe("local-rule");
  });

  it("provider fallback: classifyWithAI falls back to local rules when the active (cloud) provider throws", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    const { classifyWithAI, resetProvider, activeProviderName, lastAIError } = await import("../classifier.js");
    resetProvider();
    expect(activeProviderName()).toBe("openai");

    const result = await classifyWithAI({
      path: "/a/invoice.pdf",
      name: "invoice.pdf",
      extension: ".pdf",
      sizeBytes: 100,
      findingType: "none",
    });

    expect(result.provider).toBe("local-rule(fallback)");
    expect(result.category).toBe("Invoices");
    expect(lastAIError()).toMatch(/not yet implemented/);
  });

  it("classification duration: records a non-negative duration after classifying", async () => {
    const { classifyWithAI, resetProvider, lastClassificationDurationMs } = await import("../classifier.js");
    resetProvider();
    expect(lastClassificationDurationMs()).toBeNull();

    await classifyWithAI({
      path: "/a/file.txt",
      name: "file.txt",
      extension: ".txt",
      sizeBytes: 10,
      findingType: "none",
    });

    expect(lastClassificationDurationMs()).not.toBeNull();
    expect(lastClassificationDurationMs()).toBeGreaterThanOrEqual(0);
  });

  it("providerAvailability reflects env-driven availability for every registered provider", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    const { providerAvailability, resetProvider } = await import("../classifier.js");
    resetProvider();
    const availability = providerAvailability();
    expect(availability.local).toBe(true);
    expect(availability.openai).toBe(true);
    expect(availability.embeddings).toBe(false);
  });

  it("resetProvider clears cached diagnostics (lastError, duration)", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
    const { classifyWithAI, resetProvider, lastAIError, lastClassificationDurationMs } = await import("../classifier.js");
    resetProvider();
    await classifyWithAI({ path: "/a/x.txt", name: "x.txt", extension: ".txt", sizeBytes: 1, findingType: "none" });
    expect(lastAIError()).not.toBeNull();

    resetProvider();
    expect(lastAIError()).toBeNull();
    expect(lastClassificationDurationMs()).toBeNull();
  });
});
