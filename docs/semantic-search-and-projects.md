# Semantic Search & Project Intelligence

## Semantic Search

### How it works

Sentinel embeds extracted file text into 128-dimensional vectors using a local feature-hashing provider (FNV-1a bigrams, L2-normalised). No network calls are made by default. Vectors are stored as raw `Float32Array` BLOBs in the `embeddingChunks` SQLite table and compared at query time using brute-force cosine similarity.

**Hybrid search** (default) blends semantic score (70%) and lexical rank score (30%) for each result.

### Privacy controls

- `userSettings.embeddingsEnabled` — master switch; embeddings are **disabled by default**
- `userSettings.localOnlyProcessing` — when true, cloud provider is blocked even if `EMBEDDINGS_API_KEY` is set
- Cloud provider requires both `cloudConsent: true` AND `EMBEDDINGS_API_KEY` environment variable

### Providers

| Provider | Dimensions | Network | When used |
|---|---|---|---|
| `LocalHashEmbeddingsProvider` | 128 | None | Default (offline) |
| `CloudEmbeddingsProvider` | 1536 | OpenAI API | `cloudConsent=true` + `EMBEDDINGS_API_KEY` |

The local provider is honest about its limitations: feature hashing is a fast deterministic approximation, not neural embeddings. Similarity is meaningful for shared vocabulary but not for paraphrase or synonym matching.

### Chunking

Text is chunked by `chunkText()` in `embeddings/chunker.ts`:
- Split on double newlines (paragraph boundaries)
- Long paragraphs further split at sentence boundaries
- Max chunk size: 512 characters
- Chunks carry a sequential `index` used for passage retrieval

### API endpoints

```
GET  /api/search/semantic?q=…&limit=20&minScore=0.05&hybrid=true
GET  /api/search/index/stats
POST /api/search/index/rebuild
POST /api/search/index/embedding/:findingId
DEL  /api/search/index/embedding/:findingId
```

### Example queries (semantic mode)

- `documents related to a court matter`
- `renovation plumbing invoices`
- `brand files for a client`
- `correspondence about a particular company`

### DB schema

```sql
embeddingChunks (
  id, findingId, chunkIndex, chunkText,
  vector BLOB,   -- Float32Array, 128 or 1536 dims
  model,         -- "local-hash-v1" or "openai-text-3-small"
  createdAt, updatedAt
)
```

---

## Project Intelligence

### How it works

`projectService.ts` runs a greedy single-linkage clustering algorithm over findings using six weighted signals:

| Signal | Weight | Description |
|---|---|---|
| `folderProximity` | 0.30 | Common ancestor directory depth |
| `sharedTags` | 0.20 | Overlapping `semanticTags` |
| `sharedEntities` | 0.20 | Overlapping extracted entities (people, orgs, refs) |
| `filenameSimilarity` | 0.15 | Jaccard overlap of filename tokens |
| `sharedAiCategory` | 0.10 | Same AI category |
| `dateProximity` | 0.05 | File modified within 30/90 days |

Candidate threshold: **0.35** (pairs scoring below this are not grouped).

### Review workflow

1. Click **Analyse** on the Projects page → generates candidates
2. Review signal breakdown per candidate (folder %, tag %, entity % etc.)
3. **Approve** → creates a `projects` row; links files via `projectFiles`
4. **Reject** → marks candidate rejected; no further action
5. **Merge** (select ≥2) → creates one project from all candidate findings
6. **Split** → moves a subset of files into a new project
7. View project detail → people, organisations, timeline, file list

No files are ever moved, renamed, or deleted by the project module. Approved projects are purely metadata.

### API endpoints

```
GET  /api/projects?status=active
POST /api/projects
GET  /api/projects/candidates?status=pending
POST /api/projects/candidates/generate
POST /api/projects/candidates/:id/approve
POST /api/projects/candidates/:id/reject
POST /api/projects/candidates/merge
GET  /api/projects/:id
PATCH /api/projects/:id
POST /api/projects/:id/files
DEL  /api/projects/:id/files/:findingId
POST /api/projects/:id/split
```

### DB schema

```sql
projects (id, name, description, status, confidence, explanation, summary, createdAt, updatedAt)
projectFiles (projectId, findingId, addedBy, createdAt)
projectCandidates (id, name, status, score, signals JSON, explanation, createdAt, updatedAt)
projectCandidateFiles (candidateId, findingId, contribution, createdAt)
```

---

## Limitations & future work

- Local embeddings (128-dim feature hashing) capture vocabulary overlap but not synonymy or paraphrase. Cloud embeddings provide genuine semantic similarity.
- Brute-force cosine similarity is O(n) per query over all chunks. For large indexes (>100k chunks), consider HNSW or sqlite-vss.
- Project clustering is O(n²) pairs, capped at 500 findings per call.
- Semantic search results show `findingId` only — a follow-up could join findings to show name/path inline.
- Index rebuild is synchronous; large corpora should be moved to a background queue.
- See `docs/BACKLOG.md` for additional tracked items.
