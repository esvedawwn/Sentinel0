# Sentinel

A dark-themed file intelligence web app that scans, classifies, deduplicates, and reports on your file system.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed demo scan history (scans, findings, duplicates, AI classifications, activity)
- Optional env: `SENTINEL_DB_PATH` — path to the SQLite file (defaults to `~/.sentinel/sentinel.db`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, wouter routing, framer-motion, recharts, @tanstack/react-query
- API: Express 5 at `/api` path prefix
- DB: SQLite (`@libsql/client`) + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/db/src/schema/` — Drizzle schema (scans, files, findings, duplicates, fileHashes, activity, scanRoots, aiClassifications, semanticTags, ignoredFindings)
- `artifacts/api-server/src/routes/` — Express route handlers (dashboard, scans, files, findings, duplicates, categories, activity, reports, scanRoots)
- `artifacts/api-server/src/scanner/realScanner.ts` — real filesystem scan; populates findings, AI classification history, semantic tags, upserts scan roots, and persists duplicate groups
- `artifacts/api-server/src/scanner/duplicateDetector.ts` — staged duplicate detection: size → extension → SHA-256 hash, with path+size+mtime hash cache reuse and cooperative cancellation/progress
- `artifacts/sentinel/src/pages/` — Dashboard, Analyse, Organise, Findings, Reports, ScanHistory
- `artifacts/sentinel/src/components/Layout.tsx` — sidebar nav with ⌘1–7 shortcuts
- `artifacts/sentinel/src/index.css` — full dark theme (CSS vars for #111111 bg, #1A1A1A panel, #222222 card, #34D399 green)
- `scripts/src/seed.ts` — demo data seed script (`@workspace/scripts`)

## Architecture decisions

- Always-dark UI — no light mode; CSS vars set on `:root`, not `.dark`.
- OpenAPI-first: all endpoints defined in `openapi.yaml` before implementation; Orval generates React Query hooks + Zod schemas.
- Categories are hardcoded in the categories route (no DB table needed; they're stable config).
- Scans trigger a background `simulateScan()` / `realScanner.ts` function in the server process that streams file batches into the DB, simulating (or performing) a real indexing operation. Every completed scan is persisted — nothing is scan-and-discard.
- `duplicate_group_files`/`files` are legacy and unused for duplicate membership — duplicate group membership is now via `findings.duplicateGroupId` (each duplicate finding points at its group).
- Every `findings`/`files`/`duplicateGroups`/`activity` row carries a `scanId` FK, so scan history can always be reconstructed and reopened via `GET /findings?scanId=`.
- Duplicate detection is a staged pipeline (size → extension → SHA-256 hash) with a `fileHashes` cache keyed by path+size+mtime; resolving a group (`keep_one`) only records `canonicalFindingId` + a saveable-bytes estimate — it never deletes or moves files.
- `findings.riskLevel` is a display-only heuristic (`riskLevelFor()` in `realScanner.ts`) — it never drives automatic deletion or action.
- Ignoring a finding is additive: `ignoredFindings` gets a row and `findings.findingStatus` flips to `ignored`, but the finding row itself is never deleted — `unignore` reverses it. This is the mechanism satisfying "no deleting historical data without confirmation" for findings.
- `aiClassifications` is an append-only history table; `findings.ai_*` columns are a denormalized copy of the latest classification, kept for fast reads.
- No file contents, file bytes, or API keys are ever stored in the DB — only path/name/extension/size/timestamps/classification metadata.

## Product

- **Dashboard** — live metrics (total files, organised %, duplicates, space saved), activity feed, attention panel for corrupted/duplicate files. New Scan button launches a real scan simulation.
- **Analyse** — filterable file browser by category and status (Ready / Review / Action Required / Corrupted) with inline detail panel and editable category.
- **Organise** — side-by-side duplicate resolution (Keep Left / Keep Right / Ignore), corrupted files list.
- **Findings** — filterable findings browser (type/status/AI category/search), per-finding detail with AI intelligence panel; supports `?scanId=` to scope to one scan (used by Scan History's Reopen action).
- **Scan History** — every completed scan with status, file/byte counts, findings count, duration, and a Reopen action that deep-links into Findings scoped to that scan.
- **Reports** — summary stats, category breakdown bar chart, file type breakdown, scan history table.
- Keyboard shortcuts ⌘1–⌘7 navigate between pages (⌘6 Scan History, ⌘7 Settings).

## Gotchas

- After changing any DB schema (`lib/db/src/schema/`), run `pnpm --filter @workspace/db run push` then restart the API server workflow.
- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks and Zod schemas before using them.
- The API server must be restarted (or rebuilt) after adding/changing route files — it bundles at startup.
- `DELETE /findings/clear` deletes findings immediately with no confirmation step — this is pre-existing, unconfirmed-delete behavior, tracked in `docs/BACKLOG.md` as needing a confirmation prompt. Don't extend this pattern to new destructive endpoints.
- Route-level tests spin up an isolated SQLite DB per run via `drizzle-kit push --force` against a temp file (`SENTINEL_DB_PATH`) — see `artifacts/api-server/src/routes/__tests__/findings.test.ts` for the pattern.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
