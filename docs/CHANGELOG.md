# Changelog

All notable changes to Sentinel are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [v0.3.1-alpha] — 2026-07-10 — AI Review Pass

### Added

#### AI Diagnostics
- `getAIStatus()` now reports `providerAvailability` (per-provider up/down), `lastError`
  (message from the most recent provider failure, or `null`), and
  `lastClassificationDurationMs` (timing of the most recent classification call)
- `classifier.ts` gained `lastAIError()`, `lastClassificationDurationMs()`, and
  `providerAvailability()` for diagnostics without mutating the active provider
- New developer-facing **AI Diagnostics** panel on the Settings page: active provider,
  local/cloud mode, cloud-enabled flag, per-provider availability, last error, last
  classification duration
- `AIStatusResponse` OpenAPI schema extended with the three new fields; hooks regenerated

#### Testing
- `src/ai/__tests__/classifier.test.ts` — provider auto-selection, `AI_PROVIDER` override,
  missing-API-key behaviour, provider fallback on error, diagnostics instrumentation
- `src/ai/__tests__/status.test.ts` — cloud-disabled-by-default, cloud activation once a
  key is set, provider availability reporting, last-error/duration surfacing
- Expanded `localRule.test.ts` with dedicated suites for confidence scoring, semantic
  tags, suggested destinations, and suggested actions
- Expanded `search.test.ts` with dedicated natural-language interpretation cases
  (case-insensitivity, multi-category queries, size comparatives, explanation text)
- Total AI test count: 16 → 55, all passing

### Verified (no code change required)
- Cloud AI is disabled by default — `cloudEnabled` is `false` and the active provider is
  `local-rule` unless `OPENAI_API_KEY` or `EMBEDDINGS_API_KEY` is explicitly set
- No API keys are hardcoded anywhere in the AI layer — both cloud providers read
  exclusively from `process.env`
- File contents are never uploaded automatically — `AIClassificationInput` carries only
  filesystem metadata (path, name, extension, size, finding type, sibling filenames),
  never file bytes
- AI recommendations cannot directly delete, move, or rename files — `AIRecommendation`
  is advisory only, `requiresConfirmation` is always `true`, and no code path in the
  scanner or routes executes a recommendation automatically

### Fixed
- None — full workspace typecheck and the full test suite were already green; this pass
  found no compile errors or failing tests to fix

---

## [v0.3.0-alpha] — 2026-07-10 — AI Layer Expansion

### Added

#### AI Categories (24 total, up from 11)
Legal · Banking · Tax · Receipts · Invoices · Design · Branding ·
Web Development · Photography · Video · Audio · Renovation · Property ·
Medical · Personal Documents · Identity Documents · Business · Software ·
Installers · Archives · Screenshots · Temporary Files · Lock Files ·
Duplicate Candidates · Unknown

#### New Classification Fields
- **`subcategory`** — optional free-text refinement (e.g. "RAW original")
- **`suggestedDestination`** — optional suggested folder for organisation
- **`suggestedAction`** — human-readable advisory action text
- `AIRecommendation` gained `reversible` and `requiresConfirmation` (always `true`)
- `AIProvider` interface gained `kind: "local" | "cloud"`

#### API
- `GET /api/ai/status` — reports active AI mode (`local` / `cloud` / `offline`)
- `GET /api/ai/search` — local natural-language search interpretation (`interpretSearchQuery()`), returns matched categories/statuses/min size, no cloud call
- `Finding` schema — added `aiSubcategory`, `aiSuggestedDestination`, `aiSuggestedAction`
- New `AIStatusResponse` and `AISearchInterpretation` OpenAPI schemas

#### Database
- `findings` table: 3 new columns — `ai_subcategory`, `ai_suggested_destination`, `ai_suggested_action`

#### Findings UI
- Detail panel: subcategory line under category badge
- Detail panel: Suggested Destination / Suggested Action fields
- Detail panel: explicit "preview-only, no automatic file changes" notice
- Category color palette expanded to cover all 24 categories

#### Testing
- `src/ai/__tests__/localRule.test.ts` — unit tests for local classification across finding types, filename keywords, and safety invariants
- `src/ai/__tests__/search.test.ts` — unit tests for natural-language search interpretation
- `vitest` added to `api-server` as a dev dependency; `pnpm --filter @workspace/api-server run test`

#### Documentation
- `docs/AI_ARCHITECTURE.md` — dedicated AI architecture reference
- `docs/AI_PRIVACY.md` — data handling and privacy policy for the AI layer
- `docs/AI_ROADMAP.md` — AI-specific roadmap, split out from the general roadmap

### Safety
- No change to the safety contract — AI remains recommendation-only; all
  recommendations now explicitly assert `requiresConfirmation: true`

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
