# Sentinel — Architecture

## Overview

Sentinel is a full-stack TypeScript monorepo built on pnpm workspaces.

```
workspace root/
├── artifacts/
│   ├── api-server/     — Express 5 API (builds to dist/, runs on port 8080)
│   │   ├── src/ai/     — AI intelligence layer (classifier, providers)
│   │   ├── src/search/ — Unified search service (NL interpretation + editable filters)
│   │   └── src/extraction/ — Document extractors, OCR abstraction, sensitive-content
│   │                    and entity detection (per-file, on-demand only)
│   └── sentinel/       — React + Vite frontend (runs on PORT env var)
├── lib/
│   ├── api-spec/       — Source-of-truth OpenAPI YAML + Orval codegen config
│   ├── api-client-react/ — Generated React Query hooks (auto-generated)
│   ├── api-zod/        — Generated Zod validation schemas (auto-generated)
│   └── db/             — Drizzle ORM schema + SQLite migrations
├── scripts/            — Utility scripts
├── sample-data/        — Test fixture files for sample scans
└── docs/               — Documentation
```

## Data Flow

```
User clicks "Scan Sample Data"
        │
        ▼
POST /api/scans { path, mode: "sample" }
        │
        ▼
Express route creates scan record (status: running)
        │
        ▼
Background: runRealScan(scanId, path, isSample=true)
        │
        ├── walkDirectory() — async generator, respects SKIP_DIRS
        │       │
        │       ├── Each FILE → classifyFile() → ScanFinding or null
        │       │       └── Finding → classifyWithAI() → AIClassificationResult
        │       └── Each EMPTY DIR → classifyEmptyFolder() → ScanFinding
        │               └── Finding → classifyWithAI() → AIClassificationResult
        │
        ├── detectDuplicatesStaged() — staged pipeline: size → extension → SHA-256 hash
        │       ├── hash cache (fileHashes table) reused when size+mtime unchanged
        │       ├── cooperative cancellation + hashesComputed/hashesTotal progress
        │       └── Each hash group → duplicateGroups row + duplicate findings
        │               └── Each duplicate finding → classifyWithAI() → AIClassificationResult
        │
        └── DB writes (findings table with AI fields, scan progress updates)
```

## Key Libraries

| Layer | Library | Purpose |
|---|---|---|
| Frontend routing | wouter | Lightweight SPA router |
| Frontend data | @tanstack/react-query | Server state + caching |
| Frontend animation | framer-motion | Transitions, progress bars |
| Frontend charts | recharts | Reports bar charts |
| API contract | openapi.yaml → Orval | Type-safe codegen |
| API validation | Zod v4 | Request/response validation |
| Database | Drizzle ORM + SQLite (via @libsql/client) | Type-safe queries |
| Logging | pino + pino-http | Structured JSON logs |
| Build (API) | esbuild | Fast ESM bundle |
| Build (Frontend) | Vite 7 | HMR dev + production build |

## Scanner Architecture

The real scanner is split into modules under `artifacts/api-server/src/scanner/`:

- **`types.ts`** — shared interfaces and constants (FindingType, SKIP_DIRS, thresholds)
- **`fileWalker.ts`** — async generator that recursively walks a directory
- **`findingsEngine.ts`** — pure functions that classify files and build duplicate findings
- **`duplicateDetector.ts`** — staged duplicate detection pipeline: size grouping →
  extension split (for large size groups) → SHA-256 hashing, with a path+size+mtime hash
  cache and cooperative cancellation/progress hooks. Has no knowledge of the `scans`
  table — callers drive cancellation/progress and persist results
- **`realScanner.ts`** — orchestrator: ties DB writes, progress updates, and the modules
  above together; persists `duplicateGroups` rows and links member `findings` via
  `duplicateGroupId`

This separation means `findingsEngine` and `duplicateDetector` have no DB/IO dependencies
beyond the hash cache table, and are trivially testable in isolation.

### Duplicate detection pipeline

1. **Size grouping** — files are grouped by exact byte size; unique sizes are dropped
   immediately (a different size can never be a duplicate; this is a free, zero-IO filter).
2. **Extension split** — once a size group exceeds a threshold (20 files), it's split
   further by extension, since same-size cross-extension collisions are rare and splitting
   shrinks the number of hashes needed for large, noisy size buckets.
3. **Hashing** — only files that survive both stages are read and hashed with SHA-256
   (cryptographically collision-safe, unlike the previous MD5-based approach). A hash
   cache (`fileHashes` table, keyed by absolute path) is checked first; a cache hit is
   used only when the file's size and modified time still match what was cached.
4. **Grouping + persistence** — hash groups with 2+ members become a `duplicateGroups`
   row (`hash`, `totalSizeBytes`, `confidence: 1.0`, `explanation`) plus one `duplicate`
   finding per member, linked via `findings.duplicateGroupId`. A canonical ("keep this
   one") candidate is picked as the oldest file by modified time, tie-broken by path, and
   recorded as `canonicalFindingId` — this is a suggestion only, never an automatic action.

Cancellation is cooperative: the pipeline polls an `isCancelled()` callback between files
(same cadence as the file-walk cancel check) and can abort an in-flight file read via
`AbortSignal`. Progress is reported via `hashesComputed`/`hashesTotal` on the `scans` row.

**Never-delete guarantee**: resolving a duplicate group (`keep_one`) only sets
`canonicalFindingId` and a `savedBytes` estimate — no file is ever read for deletion or
removed from disk. Any real cleanup is future work requiring an explicit preview +
confirmation step (see Backlog).

## AI Intelligence Layer

The AI layer lives at `artifacts/api-server/src/ai/` and is completely independent of the scanner — it is called by the scanner orchestrator, not by the classification engine itself. It classifies findings into one of 24 categories, plus an optional subcategory, suggested destination, and suggested action, using a pluggable local/cloud provider abstraction that defaults to fully offline operation.

Full design detail — provider abstraction, the 24-category list, the local rule engine, natural-language search, and AI status reporting — lives in **`docs/AI_ARCHITECTURE.md`**. Data handling and privacy guarantees live in **`docs/AI_PRIVACY.md`**. Planned work lives in **`docs/AI_ROADMAP.md`**.

### Safety Contract

> AI may **only recommend actions**. It never deletes, moves, renames, or modifies files.
> Every `AIRecommendation` has `requiresConfirmation: true` unconditionally, and
> destructive suggestions additionally have `safe: false`. The scanner remains the
> only filesystem writer in the codebase and is itself read-only.

## OpenAPI-First

All API contracts are defined in `lib/api-spec/openapi.yaml` before implementation.
After changing the spec, run:

```sh
pnpm --filter @workspace/api-spec run codegen
```

This generates:
- `lib/api-client-react/src/generated/api.ts` — React Query hooks
- `lib/api-zod/src/generated/api.ts` — Zod schemas for request/response validation

The API server uses the Zod schemas for input validation; the frontend uses the React Query hooks for data fetching. Both stay in sync with the OpenAPI contract automatically.

## Database Schema

```
scans                — scan runs (path, mode, status, progress, counts)
findings             — individual findings per scan (type, path, status, hash,
                       AI fields: ai_category, ai_confidence, ai_explanation,
                       ai_tags, ai_provider)
files                — indexed files from simulated scans
duplicate_groups     — resolved/pending duplicate pairs
duplicate_group_files — junction: group ↔ file
activity             — event log (scan start/complete, findings, errors)
categories           — hardcoded (no DB table)
```

## Database

Sentinel uses **SQLite** via `@libsql/client` + `drizzle-orm/libsql`.

- Default DB path: `~/.sentinel/sentinel.db`
- Override: `SENTINEL_DB_PATH` env var
- Desktop mode: Tauri passes `SENTINEL_DB_PATH` pointing to the OS app-data directory
- WAL mode enabled for concurrent reads during active scans

## Security Constraints

- **Read-only**: the scanner never deletes, moves, or renames files
- **AI read-only**: the AI layer never performs filesystem I/O
- **Workspace-scoped**: real scans work within the Replit workspace
- **No credentials**: no cloud storage, no OAuth tokens (AI keys optional)
- **No exec**: the scanner never spawns child processes
- **Recommendation-only**: all AI suggestions require explicit user confirmation
