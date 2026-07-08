# Changelog

All notable changes to Sentinel are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [v0.2.0-alpha] — 2026-07-08 — AI Intelligence Layer

### Added

#### AI Classification Module (`artifacts/api-server/src/ai/`)
- **`AIClassificationInput`** interface — path, name, extension, sizeBytes, findingType
- **`AIClassificationResult`** interface — category, confidence (0–100), explanation, tags, recommendation, provider
- **`AIRecommendation`** interface — action, reason, safe flag (all destructive actions marked `safe: false`)
- **`AISemanticTag`** interface — label + score
- **`AIProvider`** interface — pluggable back-end abstraction
- **`LocalRuleProvider`** — offline, deterministic rule engine; classifies by extension, filename keywords, path segments, finding type, and file size; always available without any API key
- **`OpenAIProvider`** placeholder — structured stub for future GPT-4o integration; requires `OPENAI_API_KEY`
- **`EmbeddingsProvider`** placeholder — structured stub for semantic similarity classification; requires `EMBEDDINGS_API_KEY`
- **`classifyWithAI()`** — entry-point function; auto-selects provider by priority (Embeddings → OpenAI → LocalRule); falls back to LocalRule on any provider error
- **`AI_PROVIDER`** env var — override provider selection (`local`, `openai`, `embeddings`)

#### AI Categories (11 total)
Legal · Banking · Design · Renovation · Medical · Personal Documents · Media · Software · Archives · Temporary / Junk · Unknown

#### Database
- `findings` table: 5 new columns — `ai_category`, `ai_confidence` (0–100), `ai_explanation`, `ai_tags` (JSON array), `ai_provider`

#### Scanner Integration
- `realScanner.ts` — calls `classifyWithAI()` for every finding (file findings, empty folder findings, duplicate findings)
- AI classification fields written alongside every finding insert

#### API
- `GET /api/findings` — response now includes `aiCategory`, `aiConfidence`, `aiExplanation`, `aiTags`, `aiProvider` per finding
- `Finding` OpenAPI schema updated with 5 new optional fields
- `AIRecommendation` schema added to OpenAPI spec

#### Findings UI
- Table: new **AI CATEGORY** column with coloured dot indicator
- Detail panel: **✦ AI Intelligence** section showing:
  - Category badge (11 category-specific colours)
  - Animated confidence bar (green ≥85 / yellow ≥65 / red <65)
  - Human-readable explanation
  - Semantic tags as chips
  - Provider identifier

#### Documentation
- `docs/ARCHITECTURE.md` — AI layer architecture, provider selection, safety contract, updated data flow diagram
- `docs/ROADMAP.md` — v0.2.0 AI items checked off; v0.3.0 refined
- `docs/BACKLOG.md` — new AI backlog section

### Safety
- AI never deletes, moves, renames, or modifies files
- All `AIRecommendation.action` values requiring file mutation have `safe: false`
- Destructive actions remain stubbed (preview-only, require explicit confirmation)
- LocalRuleProvider has zero network I/O — works fully offline

---

## [v0.1.2-alpha] — 2026-07-08 — SQLite Migration

### Changed
- **Database engine** — migrated from PostgreSQL to SQLite via `@libsql/client` + `drizzle-orm/libsql`
- **DB path** — defaults to `~/.sentinel/sentinel.db`; override with `SENTINEL_DB_PATH` env var
- All route handlers: removed PostgreSQL-specific SQL (`::int`, `::bigint` casts, `array_length()`, `interval` syntax, `ilike`) — replaced with SQLite equivalents
- esbuild externals — added `@libsql/client`, `libsql`, and all `@libsql/*` platform packages

### Added
- Tauri desktop scaffold at `artifacts/desktop/`
- Desktop build documentation at `docs/DESKTOP_BUILD.md`
- `App.tsx` Tauri detection — calls `setBaseUrl('http://localhost:38080')` when `window.__TAURI__` is present

---

## [v0.1.1-alpha] — 2026-07-07 — Sprint 1 Hardening

### Fixed
- **Double-counting bug** — `totalFindings` in `realScanner.ts` was adding `dupFindings.length` twice
- **OOM risk** — `computeHash` switched from `fs.readFile` to streaming MD5
- **Archive type** — archives were incorrectly classified as `type: "installer"`
- **`formatBytes` duplication** — `Findings.tsx` now imports from `@/lib/utils`
- **Dead code** — `artifacts/sentinel/src/lib/formatters.ts` deleted
- **Empty folder detection** — excludes `.DS_Store` and `._*` macOS shadow files
- **`simulateScan` separation** — moved into `scanner/simulateScanner.ts`
- **`INSTALLER_EXTS`** — removed `.sh`

### Added
- `archive` finding type — distinct badge colour (`#C084FC`), dedicated filter tab
- Search on Findings — `GET /api/findings?search=` with UI input
- Settings page (⌘6) — scan configuration reference
- `bytesRecoverable` — new `GET /api/dashboard/summary` field

---

## [v0.1.0-alpha] — 2026-07-07 — Sprint 1: Foundation

### Added

#### Core Infrastructure
- pnpm monorepo with TypeScript 5.9, Node.js 24
- Express 5 API server with pino structured logging
- PostgreSQL database via Drizzle ORM
- OpenAPI-first contract: `lib/api-spec/openapi.yaml`
- Orval codegen: React Query hooks + Zod schemas auto-generated from spec
- esbuild bundler for API server

#### Real Scan Engine
- `fileWalker.ts` — async generator walks the filesystem non-blocking
- `findingsEngine.ts` — pure classifier functions for all finding types
- `realScanner.ts` — orchestrator with DB progress updates and activity events
- MD5 hashing for duplicate detection (files < 100 MB)

#### Findings Detection
- **empty_folder** · **zero_byte** · **idlk_file** · **locked_file** · **installer** · **large_file** · **duplicate**

#### Frontend
- Always-dark UI (#111111 bg, #1A1A1A panels, #222222 cards)
- **Dashboard** · **Analyse** · **Organise** · **Findings** · **Reports**
- Keyboard shortcuts ⌘1–⌘5

#### Documentation
- `docs/VISION.md` · `docs/ROADMAP.md` · `docs/ARCHITECTURE.md` · `docs/BACKLOG.md`

### Security
- Scanner is read-only — no delete, move, or rename
- All destructive actions stubbed as "coming soon"
