# Sentinel — Architecture

## Overview

Sentinel is a full-stack TypeScript monorepo built on pnpm workspaces.

```
workspace root/
├── artifacts/
│   ├── api-server/     — Express 5 API (builds to dist/, runs on port 8080)
│   │   └── src/ai/     — AI intelligence layer (classifier, providers)
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
        ├── computeHash() — MD5 for files < 100 MB
        │
        ├── detectDuplicates() — groups by hash, emits duplicate findings
        │       └── Each duplicate → classifyWithAI() → AIClassificationResult
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

The real scanner is split into four modules under `artifacts/api-server/src/scanner/`:

- **`types.ts`** — shared interfaces and constants (FindingType, SKIP_DIRS, thresholds)
- **`fileWalker.ts`** — async generator that recursively walks a directory
- **`findingsEngine.ts`** — pure functions that classify files and detect duplicates
- **`realScanner.ts`** — orchestrator: ties DB writes, progress updates, and the modules above

This separation means `findingsEngine` has no DB/IO dependencies and is trivially testable.

## AI Intelligence Layer

The AI layer lives at `artifacts/api-server/src/ai/` and is completely independent of the scanner — it is called by the scanner orchestrator, not by the classification engine itself.

```
src/ai/
├── types.ts            — AIClassificationInput, AIClassificationResult,
│                         AIRecommendation, AISemanticTag, AIProvider
├── classifier.ts       — Provider factory + classifyWithAI() entry point
├── index.ts            — Barrel exports
└── providers/
    ├── localRule.ts    — Offline rule-based classifier (always available)
    ├── openai.ts       — OpenAI GPT placeholder (requires OPENAI_API_KEY)
    └── embeddings.ts   — Semantic embeddings placeholder (requires EMBEDDINGS_API_KEY)
```

### Provider Selection

`classifyWithAI()` auto-selects a provider based on available credentials:

1. **EmbeddingsProvider** — if `EMBEDDINGS_API_KEY` is set
2. **OpenAIProvider** — if `OPENAI_API_KEY` is set
3. **LocalRuleProvider** — always available, no API key needed (offline)

Override with `AI_PROVIDER=local|openai|embeddings` env var.

### LocalRuleProvider Rules Engine

Categories (ordered by rule priority):

| Category | Primary Signals |
|---|---|
| Temporary / Junk | Finding type: `idlk_file`, `zero_byte`, `empty_folder`, `locked_file`; ext: `.tmp`, `.bak` |
| Software | Finding type: `installer`; ext: code files (`.ts`, `.py`, `.js`, …) |
| Archives | Finding type: `archive` |
| Design | Ext: `.psd`, `.ai`, `.sketch`, `.fig`, `.xd`, `.indd`, `.svg`, … |
| Media | Ext: image (`.jpg`, `.raw`, …), video (`.mp4`, `.mov`, …), audio (`.mp3`, …) |
| Legal | Name/path keywords: contract, nda, deed, agreement, litigation, … |
| Banking | Name/path keywords: invoice, receipt, tax, payroll, budget, … |
| Medical | Name/path keywords: medical, prescription, diagnosis, lab, … |
| Renovation | Name/path keywords: renovation, contractor, blueprint, permit, … |
| Personal Documents | Name keywords: passport, resume, birth certificate, ssn, … |
| Unknown | No rule matched |

### Safety Contract

> AI may **only recommend actions**. It never deletes, moves, renames, or modifies files.
> All destructive suggestions have `safe: false` on `AIRecommendation` and must be
> confirmed explicitly by the user before execution. The scanner is read-only.

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
