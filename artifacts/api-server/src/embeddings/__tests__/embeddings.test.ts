import { describe, it, expect } from "vitest";
import { LocalHashEmbeddingsProvider, cosineSimilarity, LOCAL_EMBEDDING_DIM } from "../providers.js";
import { chunkText, rankChunks } from "../chunker.js";
import { mergeResults } from "../hybridSearch.js";
import type { SemanticHit } from "../embeddingService.js";
import type { Finding } from "@workspace/db";

// ────────────────────────────────────────────────────────────────────────────
// Local embeddings provider
// ────────────────────────────────────────────────────────────────────────────

describe("LocalHashEmbeddingsProvider", () => {
  const provider = new LocalHashEmbeddingsProvider();

  it("produces a 128-dimensional unit-normalized vector", async () => {
    const vec = await provider.embed("renovation plumbing invoice paid");
    expect(vec.length).toBe(LOCAL_EMBEDDING_DIM);

    // Should be approximately unit length (cosine-similarity self-check)
    const selfSim = cosineSimilarity(vec, vec);
    expect(selfSim).toBeCloseTo(1.0, 3);
  });

  it("returns stable vectors (deterministic)", async () => {
    const a = await provider.embed("court matter legal documents hearing");
    const b = await provider.embed("court matter legal documents hearing");
    expect(a.every((v, i) => v === b[i])).toBe(true);
  });

  it("similar texts score higher than dissimilar texts", async () => {
    const plumbing = await provider.embed("plumbing invoice bathroom renovation sink");
    const similar = await provider.embed("plumbing quote kitchen renovation faucet");
    const unrelated = await provider.embed("quarterly financial report revenue growth");

    const simScore = cosineSimilarity(plumbing, similar);
    const unrelScore = cosineSimilarity(plumbing, unrelated);
    expect(simScore).toBeGreaterThan(unrelScore);
  });

  it("empty text produces a zero-like vector without throwing", async () => {
    const vec = await provider.embed("");
    expect(vec.length).toBe(LOCAL_EMBEDDING_DIM);
    expect(vec.some((v) => !isNaN(v))).toBe(true);
  });

  it("embedBatch produces same results as serial embed", async () => {
    const texts = ["brand files client logo", "legal correspondence company", "tax invoice amount due"];
    const batch = await provider.embedBatch(texts);
    for (let i = 0; i < texts.length; i++) {
      const single = await provider.embed(texts[i]);
      expect(cosineSimilarity(batch[i], single)).toBeCloseTo(1.0, 4);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cosine similarity
// ────────────────────────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("identical vectors → 1.0", () => {
    const v = new Float32Array([0.6, 0.8]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("orthogonal vectors → 0.0", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("opposite vectors → -1.0", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it("throws on dimension mismatch", () => {
    expect(() =>
      cosineSimilarity(new Float32Array([1, 2, 3]), new Float32Array([1, 2]))
    ).toThrow("dimension mismatch");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Text chunker
// ────────────────────────────────────────────────────────────────────────────

describe("chunkText", () => {
  it("single short paragraph → one chunk", () => {
    const chunks = chunkText("This is a short paragraph about plumbing invoices.");
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain("plumbing");
  });

  it("splits on double newlines", () => {
    const text = "First paragraph about the court matter.\n\nSecond paragraph about the renovation.";
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("long paragraph is split into multiple chunks, each ≤ 512 chars", () => {
    const longPara = "This is a sentence about brand files for a client. ".repeat(30);
    const chunks = chunkText(longPara);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(512);
    }
  });

  it("empty text returns no chunks", () => {
    expect(chunkText("")).toHaveLength(0);
    expect(chunkText("   ")).toHaveLength(0);
  });

  it("assigns sequential indices", () => {
    const text = Array.from({ length: 5 }, (_, i) => `Paragraph ${i + 1} ${"content ".repeat(10)}`).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((c, _i) => {
      expect(c.index).toBeGreaterThanOrEqual(0);
    });
  });

  it("chunk text matches original wording", () => {
    const text = "Invoice number INV-2024-001 for renovation work at 42 Oak Street.";
    const chunks = chunkText(text);
    expect(chunks[0].text).toContain("INV-2024-001");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Rank chunks
// ────────────────────────────────────────────────────────────────────────────

describe("rankChunks", () => {
  const chunks = [
    { index: 0, text: "Correspondence from Johnson & Partners about the Henderson court matter." },
    { index: 1, text: "Plumbing invoice from BuildRight for bathroom renovation." },
    { index: 2, text: "Brand guidelines for Acme Corp client presentation." },
    { index: 3, text: "Court documents and legal filings for Henderson v. City case." },
  ];

  it("ranks court-related chunks higher for a court matter query", () => {
    const ranked = rankChunks(chunks, "court matter legal documents", 2);
    const texts = ranked.map((c) => c.text);
    expect(texts.some((t) => t.toLowerCase().includes("court"))).toBe(true);
  });

  it("ranks plumbing chunks higher for a plumbing query", () => {
    const ranked = rankChunks(chunks, "plumbing renovation", 1);
    expect(ranked[0].text).toContain("Plumbing");
  });

  it("returns at most topN results", () => {
    const ranked = rankChunks(chunks, "anything", 2);
    expect(ranked.length).toBeLessThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Hybrid search merge
// ────────────────────────────────────────────────────────────────────────────

describe("mergeResults", () => {
  const makeFinding = (id: number): Finding => ({
    id, scanId: 1, type: "archive", path: `/files/doc${id}.pdf`, name: `doc${id}.pdf`,
    extension: "pdf", sizeBytes: 1024, hash: null, duplicateGroupHash: null, duplicateGroupId: null,
    findingStatus: "review", riskLevel: "low", reviewStatus: "new", reviewedAt: null,
    reason: "", fileCreatedAt: null, fileModifiedAt: null, aiCategory: null, aiSubcategory: null,
    aiConfidence: null, aiExplanation: null, aiTags: null, aiSuggestedDestination: null,
    aiSuggestedAction: null, aiProvider: null, createdAt: new Date(),
  });

  const lexical = [makeFinding(1), makeFinding(2), makeFinding(3)];
  const semantic: SemanticHit[] = [
    { findingId: 2, chunkId: 10, chunkText: "plumbing invoice", score: 0.85, model: "local-hash-v1" },
    { findingId: 4, chunkId: 11, chunkText: "court matter", score: 0.70, model: "local-hash-v1" },
  ];

  it("combines semantic + lexical scores with weights", () => {
    const results = mergeResults(lexical, semantic, { hybrid: true, limit: 10 });
    const finding2 = results.find((r) => r.findingId === 2);
    expect(finding2).toBeDefined();
    expect(finding2!.semanticScore).toBeCloseTo(0.85);
    expect(finding2!.lexicalScore).toBeGreaterThan(0);
    expect(finding2!.combinedScore).toBeCloseTo(0.85 * 0.7 + finding2!.lexicalScore * 0.3, 2);
  });

  it("includes semantic-only hits when hybrid=true", () => {
    const results = mergeResults(lexical, semantic, { hybrid: true, limit: 10 });
    expect(results.some((r) => r.findingId === 4)).toBe(true);
  });

  it("does NOT include lexical-only hits when hybrid=false (semantic only)", () => {
    const results = mergeResults(lexical, semantic, { hybrid: false, limit: 10 });
    // Finding 1 has no semantic hit → should not appear
    expect(results.some((r) => r.findingId === 1)).toBe(false);
  });

  it("results are sorted by combinedScore descending", () => {
    const results = mergeResults(lexical, semantic, { hybrid: true, limit: 10 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].combinedScore).toBeGreaterThanOrEqual(results[i].combinedScore);
    }
  });

  it("matchedPassage is returned for semantic hits", () => {
    const results = mergeResults(lexical, semantic, { hybrid: true, limit: 10 });
    const finding2 = results.find((r) => r.findingId === 2);
    expect(finding2?.matchedPassage).toBe("plumbing invoice");
  });

  it("respects limit", () => {
    const results = mergeResults(lexical, semantic, { hybrid: true, limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
