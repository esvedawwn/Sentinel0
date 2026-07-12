# Sentinel Semantic Search

Sentinel's semantic search layer extends text-based search with embedding
vectors — enabling queries like "find contracts similar to this one" without
spelling out exact keywords.

> **Current status (v0.7.0-alpha):** Embeddings are generated but not yet
> surfaced in the main Search page UI. The backend architecture (chunking,
> vector storage, cosine similarity) is complete. The planned UX is described
> in the [Roadmap](#roadmap) section below.

---

## How it works

```
Per-file extraction (on demand, user-triggered)
        │
        ▼
┌─────────────────────────────┐
│  Text Extractor             │
│  (txt/csv/json/md/pdf/code) │   → extractedText table
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  Paragraph-aware chunker    │
│  max 512 chars per chunk    │   → embeddingChunks table
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  Embedding model            │
│  local-hash-v1 (default)    │   Float32Array stored in SQLite BLOB
│  openai-text-embedding-3-   │   (gated: requires cloudConsent)
│  small (optional)           │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  Cosine similarity scorer   │
│  (in-memory, JS)            │   No external vector DB required
└─────────────────────────────┘
```

---

## Embedding models

| Model | Locality | Dimensionality | Requires |
|-------|----------|----------------|---------|
| `local-hash-v1` | Fully local | 128 | Nothing (default) |
| `openai-text-embedding-ada-002` | Cloud | 1536 | `cloudConsent: true` |
| `openai-text-embedding-3-small` | Cloud | 1536 | `cloudConsent: true` |

`local-hash-v1` is a hash-based local embedding model. It does not produce
semantically meaningful similarity across unrelated documents, but it is
privacy-preserving, instant, and requires no API key. It is the default for
the "local-only processing" posture.

Cloud embedding models produce proper semantic vectors. They are only invoked
when `userSettings.localOnlyProcessing = false` AND `cloudConsent = true`.
Chunks of extracted text (not full file contents) are sent to the embedding API.

---

## Schema

### `extractedText`

One row per file extraction. Contains the full extracted text, OCR flags,
confidence score, page count (for PDFs), and sensitive-content detection results.

```sql
extractedText(
  id, findingId, text, wordCount, charCount,
  ocrUsed, ocrConfidence, pageCount,
  hasSensitiveContent, sensitiveContentTypes,
  extractedAt, extractorVersion
)
```

### `entities`

Heuristic entity detection — names, emails, phone numbers, dates, monetary
values, organisation names extracted from `extractedText.text`.

```sql
entities(
  id, extractedTextId, findingId,
  entityType, value, confidence, occurrenceCount
)
```

### `embeddingChunks`

Paragraph-split chunks of `extractedText.text` with their embedding vectors.

```sql
embeddingChunks(
  id, findingId, extractedTextId, chunkIndex,
  chunkText,
  vector BLOB,         -- raw Float32Array, little-endian
  model, dimensionality,
  createdAt
)
```

Vectors are stored as raw `Float32` blobs (no external vector database).
Cosine similarity is computed in JavaScript at query time over the filtered
candidate set.

---

## Privacy guarantees

1. **Extraction is always on-demand** — no file contents are extracted
   automatically. The user must trigger extraction per-file.
2. **No raw file contents stored** — `extractedText.text` stores only extracted
   plain text. Binary data is never written to the DB.
3. **Cloud embedding is double-gated** — requires both `localOnlyProcessing: false`
   (requires explicit setting toggle) AND `cloudConsent: true` (requires a
   separate consent flag). The settings API enforces this and returns 409 if
   consent has not been granted.
4. **Clearing is always available** — three privacy endpoints let users delete
   subsets of indexed data without touching any files:
   - `DELETE /settings/index` — all scan metadata
   - `DELETE /settings/extracted-text` — extracted text + entities + embeddings
   - `DELETE /settings/embeddings` — embedding vectors only (preserves text)

---

## Cosine similarity

```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

Scores range from -1 (opposite) to 1 (identical). Typical semantic similarity
thresholds: > 0.85 = very similar, > 0.70 = related, < 0.50 = unrelated.

---

## Roadmap

Planned UI features (see `docs/BACKLOG.md` for priority):

- **Semantic similar-to** — "Find files similar to this one" button on a finding
  detail panel that queries embeddings for the 10 nearest neighbours.
- **Semantic query mode** — Toggle in Search page to switch from keyword filter
  mode to embedding similarity mode for a typed concept query.
- **Cross-document entity graph** — Visual graph of entities (people, orgs) and
  their co-occurrence across files.
- **Cluster view** — Group findings by embedding cluster (UMAP projection or
  k-means) to surface thematic groupings without a predefined query.
