/**
 * Embeddings provider abstraction.
 *
 * LOCAL PROVIDER (LocalHashEmbeddingsProvider):
 *   Uses the feature-hashing trick — each token is hashed to a bucket in a
 *   128-dimensional space and weighted by its term frequency. Completely
 *   offline, no model download, deterministic. Cosine similarity on these
 *   vectors gives reasonable proximity for texts with overlapping vocabulary.
 *   Honest limitation: this is NOT a neural embedding — it cannot represent
 *   synonyms or paraphrase. It works best for exact/near-exact term overlap.
 *
 * CLOUD PROVIDER (CloudEmbeddingsProvider):
 *   Calls the OpenAI embeddings API (text-embedding-3-small by default).
 *   Disabled by default. Requires BOTH:
 *     1. userSettings.cloudConsent = true
 *     2. EMBEDDINGS_API_KEY env var present
 *   Returns a 1536-dimensional (or 256 when truncated) neural vector that
 *   captures semantic meaning across synonyms, paraphrase, and domain terms.
 *
 * PRIVACY:
 *   Neither provider sends data without explicit consent. The cloud path is
 *   gated at the call site in `embeddingService.ts` — providers themselves
 *   do not enforce consent (the service layer does), so do not call cloud
 *   providers directly outside `embeddingService.ts`.
 */

export type EmbeddingVector = Float32Array;
export type EmbeddingModelName = "local-hash-v1" | "openai-text-embedding-3-small";

export interface EmbeddingsProvider {
  readonly model: EmbeddingModelName;
  readonly dimensionality: number;
  /** Embed a single text string, returning a unit-normalized Float32Array. */
  embed(text: string): Promise<EmbeddingVector>;
  /** Embed multiple texts. Default: calls embed() in serial — override for batching. */
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

/** Compute cosine similarity between two unit-normalized vectors (range −1 to 1). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("Vector dimension mismatch");
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** L2-normalize a vector in place and return it. */
function l2Normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-10) return v;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

// ────────────────────────────────────────────────────────────────────────────
// Tokenizer (shared by local provider)
// ────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "to", "for", "with", "on", "at",
  "by", "from", "as", "is", "was", "are", "were", "be", "been", "being", "it",
  "its", "this", "that", "these", "those", "which", "who", "what", "how",
  "has", "have", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "shall", "can", "not", "no", "but", "so", "if", "then",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

// ────────────────────────────────────────────────────────────────────────────
// FNV-1a 32-bit hash (deterministic, fast)
// ────────────────────────────────────────────────────────────────────────────

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  return hash;
}

// ────────────────────────────────────────────────────────────────────────────
// Local hash-based provider
// ────────────────────────────────────────────────────────────────────────────

export const LOCAL_EMBEDDING_DIM = 128;

export class LocalHashEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: EmbeddingModelName = "local-hash-v1";
  readonly dimensionality = LOCAL_EMBEDDING_DIM;

  embed(text: string): Promise<EmbeddingVector> {
    const tokens = tokenize(text);
    const vector = new Float32Array(this.dimensionality);

    // Count bigrams too for slightly better phrase capture
    const features: string[] = [...tokens];
    for (let i = 0; i < tokens.length - 1; i++) {
      features.push(`${tokens[i]}:${tokens[i + 1]}`);
    }

    const tf: Map<string, number> = new Map();
    for (const f of features) {
      tf.set(f, (tf.get(f) ?? 0) + 1);
    }

    for (const [token, count] of tf) {
      // Map token to two buckets (reduces collision distortion)
      const bucket1 = fnv1a(token) % this.dimensionality;
      const bucket2 = fnv1a(token + "_b") % this.dimensionality;
      const weight = count / Math.max(features.length, 1);
      vector[bucket1] += weight;
      vector[bucket2] += weight * 0.5;
    }

    return Promise.resolve(l2Normalize(vector));
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cloud provider (OpenAI — disabled by default, requires cloudConsent)
// ────────────────────────────────────────────────────────────────────────────

export const CLOUD_EMBEDDING_DIM = 256; // truncated from 1536 for storage efficiency

export class CloudEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: EmbeddingModelName = "openai-text-embedding-3-small";
  readonly dimensionality = CLOUD_EMBEDDING_DIM;

  private readonly apiKey: string;
  private readonly apiBase: string;

  constructor(apiKey: string, apiBase = "https://api.openai.com/v1") {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const res = await fetch(`${this.apiBase}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
        dimensions: this.dimensionality,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      throw new Error(`OpenAI embeddings error ${res.status}: ${body}`);
    }

    const json = await res.json() as { data: Array<{ embedding: number[]; index: number }> };
    const ordered = json.data.sort((a, b) => a.index - b.index);
    return ordered.map(({ embedding }) => l2Normalize(new Float32Array(embedding)));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Factory — builds the right provider from settings
// ────────────────────────────────────────────────────────────────────────────

export function buildEmbeddingsProvider(opts: {
  cloudConsent: boolean;
  localOnly: boolean;
}): EmbeddingsProvider {
  const apiKey = process.env.EMBEDDINGS_API_KEY;
  if (!opts.localOnly && opts.cloudConsent && apiKey) {
    return new CloudEmbeddingsProvider(apiKey);
  }
  return new LocalHashEmbeddingsProvider();
}
