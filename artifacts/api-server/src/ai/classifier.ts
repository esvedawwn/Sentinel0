/**
 * AI Classifier
 *
 * Factory + entry point for AI-powered file classification.
 * Selects the active provider based on environment configuration,
 * falls back to LocalRuleProvider if no cloud provider is available.
 *
 * Provider priority:
 *   1. EmbeddingsProvider (if EMBEDDINGS_API_KEY is set)
 *   2. OpenAIProvider     (if OPENAI_API_KEY is set)
 *   3. LocalRuleProvider  (always available — offline, no API key needed)
 *
 * Override by setting AI_PROVIDER env var to "local", "openai", or "embeddings".
 *
 * Safety: classifiers are read-only. Results are recommendations only.
 */

import type { AIClassificationInput, AIClassificationResult, AIProvider } from "./types.js";
import { LocalRuleProvider } from "./providers/localRule.js";
import { OpenAIProvider } from "./providers/openai.js";
import { EmbeddingsProvider } from "./providers/embeddings.js";

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers: Record<string, () => AIProvider> = {
  local: () => new LocalRuleProvider(),
  openai: () => new OpenAIProvider(),
  embeddings: () => new EmbeddingsProvider(),
};

let _activeProvider: AIProvider | null = null;

function resolveProvider(): AIProvider {
  if (_activeProvider) return _activeProvider;

  const override = process.env.AI_PROVIDER?.toLowerCase();
  if (override && providers[override]) {
    const p = providers[override]();
    if (p.isAvailable()) {
      _activeProvider = p;
      return p;
    }
  }

  // Auto-select: prefer cloud providers when keys are present
  const embeddings = new EmbeddingsProvider();
  if (embeddings.isAvailable()) {
    _activeProvider = embeddings;
    return embeddings;
  }

  const openai = new OpenAIProvider();
  if (openai.isAvailable()) {
    _activeProvider = openai;
    return openai;
  }

  // Offline fallback
  _activeProvider = new LocalRuleProvider();
  return _activeProvider;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a file using the active provider.
 * Falls back to LocalRuleProvider on any provider error.
 *
 * Safe to call from within scan loops — LocalRuleProvider has no I/O.
 */
export async function classifyWithAI(
  input: AIClassificationInput
): Promise<AIClassificationResult> {
  const provider = resolveProvider();

  try {
    return await provider.classify(input);
  } catch {
    // On any provider failure, fall back to local rules
    const fallback = new LocalRuleProvider();
    const result = await fallback.classify(input);
    return { ...result, provider: `${result.provider}(fallback)` };
  }
}

/** Returns the name of the currently active provider. */
export function activeProviderName(): string {
  return resolveProvider().name;
}

/** Reset the cached provider (useful in tests or after env changes). */
export function resetProvider(): void {
  _activeProvider = null;
}
