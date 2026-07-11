---
name: Embeddings + Projects arch
description: How semantic search and project intelligence are built and gated
---

## Semantic search

- **Provider abstraction**: `embeddings/providers.ts` — `EmbeddingsProvider` interface with `embed()` and `embedBatch()`
- **Local provider**: `LocalHashEmbeddingsProvider` — 128-dim FNV-1a bigram feature hashing, L2-normalised; fully offline; deterministic
- **Cloud provider**: `CloudEmbeddingsProvider` — OpenAI `text-embedding-3-small` (1536-dim); requires `cloudConsent=true` AND `EMBEDDINGS_API_KEY` env var
- **Privacy gates**: `userSettings.embeddingsEnabled` (master), `localOnlyProcessing` (blocks cloud even with key)
- **Chunker**: `embeddings/chunker.ts` — paragraph→sentence split, max 512 chars per chunk
- **Storage**: `embeddingChunks` table — vector stored as `Float32Array` BLOB (little-endian), model column tracks which provider created it
- **Similarity**: brute-force cosine in JS; O(n) per query; suitable for thousands of chunks
- **Hybrid**: semantic 0.7 + lexical rank 0.3 (when `hybrid=true`); blended in route handler

## Project intelligence

- **Service**: `projects/projectService.ts`
- **Algorithm**: greedy single-linkage clustering, O(n²) pairs, capped at 500 findings
- **Signals** (6 weighted): folderProximity(0.30), sharedTags(0.20), sharedEntities(0.20), filenameSimilarity(0.15), sharedAiCategory(0.10), dateProximity(0.05)
- **Threshold**: 0.35 (exported as `CANDIDATE_THRESHOLD`)
- **Review flow**: generate → approve/reject/merge candidates → approved creates project row → split to divide
- **Invariant**: no files are ever moved, renamed, or deleted by the project module — it is purely metadata

## Key files

- `artifacts/api-server/src/embeddings/` — providers, chunker, hybridSearch, embeddingService
- `artifacts/api-server/src/projects/projectService.ts`
- `artifacts/api-server/src/routes/embeddings.ts` — `/api/search/semantic`, `/api/search/index/*`
- `artifacts/api-server/src/routes/projects.ts` — `/api/projects*`, `/api/projects/candidates*`
- `lib/db/src/schema/` — `embeddingChunks`, `projects`, `projectFiles`, `projectCandidates`, `projectCandidateFiles`
- `artifacts/sentinel/src/pages/Projects.tsx` — candidates tab, projects tab, project detail
- `docs/semantic-search-and-projects.md` — full architecture doc
