/**
 * EmbeddingsProvider — Placeholder
 *
 * Future integration point for semantic similarity classification using
 * text embeddings (e.g. OpenAI text-embedding-3-small or a local model).
 *
 * When implemented, this provider will:
 *   - Embed the filename and path into a vector
 *   - Compare against a labelled reference set of category embeddings
 *   - Return the closest category with a cosine-similarity confidence score
 *
 * Advantages over rule-based:
 *   - Handles previously unseen file naming conventions
 *   - Language-agnostic (works with non-English filenames)
 *   - Learns from user corrections over time (active learning loop)
 *
 * Required env vars (none required yet):
 *   - EMBEDDINGS_API_KEY — API key for the embeddings service
 *   - EMBEDDINGS_MODEL   — model identifier (default: text-embedding-3-small)
 *   - EMBEDDINGS_BASE_URL — override endpoint for self-hosted models
 *
 * Safety: AI may only recommend actions. No file mutations are permitted.
 */

import type { AIClassificationInput, AIClassificationResult, AIProvider } from "../types.js";

export class EmbeddingsProvider implements AIProvider {
  readonly name = "embeddings";

  isAvailable(): boolean {
    return (
      typeof process.env.EMBEDDINGS_API_KEY === "string" &&
      process.env.EMBEDDINGS_API_KEY.length > 0
    );
  }

  async classify(_input: AIClassificationInput): Promise<AIClassificationResult> {
    if (!this.isAvailable()) {
      throw new Error("EmbeddingsProvider: EMBEDDINGS_API_KEY is not set");
    }

    // TODO: implement when embeddings integration is enabled
    // 1. Build text representation: `${input.name} ${pathSegments.join(" ")}`
    // 2. Call embeddings API
    // 3. Compare against reference category embeddings
    // 4. Return closest category with cosine similarity as confidence

    throw new Error("EmbeddingsProvider: not yet implemented");
  }
}
