# Sentinel

A dark-themed file intelligence web app that scans, classifies, deduplicates, and reports on your file system.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, wouter routing, framer-motion, recharts, @tanstack/react-query
- API: Express 5 at `/api` path prefix
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/db/src/schema/` — Drizzle schema (scans, files, duplicates, activity)
- `artifacts/api-server/src/routes/` — Express route handlers (dashboard, scans, files, duplicates, categories, activity, reports)
- `artifacts/sentinel/src/pages/` — Dashboard, Analyse, Organise, Reports
- `artifacts/sentinel/src/components/Layout.tsx` — sidebar nav with ⌘1–4 shortcuts
- `artifacts/sentinel/src/index.css` — full dark theme (CSS vars for #111111 bg, #1A1A1A panel, #222222 card, #34D399 green)

## Architecture decisions

- Always-dark UI — no light mode; CSS vars set on `:root`, not `.dark`.
- OpenAPI-first: all endpoints defined in `openapi.yaml` before implementation; Orval generates React Query hooks + Zod schemas.
- Categories are hardcoded in the categories route (no DB table needed; they're stable config).
- Scans trigger a background `simulateScan()` function in the server process that streams file batches into the DB over ~12 seconds, simulating a real indexing operation.
- `duplicate_group_files.file_id` must reference `files.id` (not `duplicate_groups.id`) — this was a schema bug fixed during development.

## Product

- **Dashboard** — live metrics (total files, organised %, duplicates, space saved), activity feed, attention panel for corrupted/duplicate files. New Scan button launches a real scan simulation.
- **Analyse** — filterable file browser by category and status (Ready / Review / Action Required / Corrupted) with inline detail panel and editable category.
- **Organise** — side-by-side duplicate resolution (Keep Left / Keep Right / Ignore), corrupted files list.
- **Reports** — summary stats, category breakdown bar chart, file type breakdown, scan history table.
- Keyboard shortcuts ⌘1–⌘4 navigate between the four pages.

## Gotchas

- After changing any DB schema (`lib/db/src/schema/`), run `pnpm --filter @workspace/db run push` then restart the API server workflow.
- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks and Zod schemas before using them.
- The API server must be restarted (or rebuilt) after adding/changing route files — it bundles at startup.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
