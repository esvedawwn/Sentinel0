# Changelog

All notable changes to Sentinel are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [v0.7.1-alpha] — 2026-07-12 — Reliable macOS SEA sidecar packaging

### Fixed

#### macOS sidecar build (`artifacts/desktop/scripts/build-server.mjs`)
- **Root cause confirmed**: Homebrew's `node@22` build strips the
  `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` marker that postject
  requires; the previous script silently continued after the injection failure
  and copied an invalid binary into `src-tauri/binaries/`.
- **Fix**: `build-server.mjs` now downloads an official Node.js v22.16.0
  arm64 binary from nodejs.org into `/tmp/` (cached; only fetched once).
  The user's globally-installed Node.js is no longer used as the injection
  base, so Homebrew installs work transparently.
- All failures (download, fuse preflight, postject, post-injection check,
  smoke test) are now **fatal** — the script exits non-zero and never copies
  an incomplete binary.
- Stale sidecar is removed at build start (step 0) to prevent shipping an
  artifact from a previous failed run.
- Added 10-step progress output with clear error messages for each failure mode.

#### Preflight & validation
- Preflight check: verifies the SEA fuse marker is present in the downloaded
  binary before invoking postject; `pnpm desktop:check` also verifies the
  cached binary and the installed sidecar.
- Post-injection check: reads the output binary and confirms the fuse marker
  is still present, and that the file is > 5 MB (i.e. the blob was actually
  injected, not just the raw Node.js binary copied).
- Smoke test (`SENTINEL_SMOKE_TEST=1`): runs the produced sidecar and requires
  exit 0 + expected stdout.  Implemented via a CJS banner injected by
  `build.mjs` that fires before any native module (`@libsql/client`) loads.

#### `artifacts/api-server/build.mjs`
- CJS builds now get a banner that checks `SENTINEL_SMOKE_TEST` and exits 0
  immediately, before any `require()` to native modules, enabling the smoke
  test to work without the full libsql runtime available at build time.

#### Documentation
- `docs/MAC_DESKTOP_BUILD.md`: updated Node.js prerequisite section with
  Homebrew warning, nvm/Volta instructions, and a note that the build script
  handles the download automatically.  Updated Step 1 description and
  troubleshooting table.
- `docs/CHANGELOG.md`: this entry.

---

## [v0.7.0-alpha] — 2026-07-12 — Enhanced NL Search, Hybrid Ranking, Entity Search, Search UI

### Added

#### Enhanced NL Interpreter (`ai/search.ts` v2)
- Precise size expressions: "larger than 500 MB", "under 1 GB", "over 500 KB"
  resolve to exact `minSizeBytes`/`maxSizeBytes` values.
- Relative + absolute date parsing: "last week", "this month", "from June",
  "in 2024", "last year" — all resolved against an injectable reference date
  for deterministic test coverage.
- Extension shortcuts: "PDFs" → `pdf`, "Word docs" → `docx`, "spreadsheets" → `xlsx/xls/csv`,
  "Excel" → `xlsx`, plus explicit extension literals (`.csv`, `.json`, etc.).
- Entity-mention patterns: "mentioning Ingrid", "related to Alpha Hair",
  "files regarding Kennards", "everything about Ryde renovation" — extracts a
  `mentionedEntity` string with original casing preserved.
- Finding-type shortcuts: "duplicate", "installer", "archive", "lock file"
  resolve to internal `FindingType` values.
- `confidence` score (0–1) reflecting how many query words were interpreted.
- `appliedFilters[]` — typed list of every inferred filter with `source`,
  `label`, and `value`, shown as dismissible chips in the Search UI.
- `unrecognizedTerms[]` — words the interpreter could not map to any filter.

#### Hybrid Relevance Scoring (`searchService.ts` v2)
- `scoreFindings()` — post-filter ranking of each result with:
  - `relevanceScore` (0–1) clamped and sorted descending.
  - `matchedFactors[]` — human-readable list of why each result ranked where it did.
  - `matchExplanation` — full sentence combining match factors and AI classification.
- Scoring weights: exact filename match (0.5), substring filename (0.35), term
  coverage (0.25), path match (0.1/0.05), AI category match (0.15–0.2), AI
  confidence bonus (0.05), duplicate status bonus (0.1), extension match (0.1).

#### Entity Search
- `SearchFilters.mentionedEntity` — filters findings via a `findingId` subquery
  into `entitiesTable.value`, enabling NL queries like
  "invoices mentioning Kennards" to surface only documents that contain that
  entity reference in their extracted text.

#### New filter fields
- `extensions[]` — multi-extension filter (any-of semantics), populated by NL
  interpretation or the explicit query param.
- `findingTypes[]` — filter by one or more `FindingType` values simultaneously.
- `mentionedEntity` — filter via entity subquery (NL or explicit param).

#### OpenAPI contract
- `/search` — new query params: `mentionedEntity`, `extensions` (comma-separated),
  `findingTypes` (comma-separated).
- New schemas: `AppliedFilter`, `ScoredFinding` (extends `Finding` with
  `relevanceScore`, `matchedFactors`, `matchExplanation`).
- `SearchResults` — new fields: `confidence`, `appliedFilters`, `unrecognizedTerms`.

#### Search UI (`Search.tsx`)
- Applied-filter chips displayed under the search bar with colour-coded sources
  (category/date/size/extension/status/entity) and a confidence badge.
- `⚠ Unrecognised terms` warning strip when the interpreter drops query words.
- Relevance score pip (green/amber/dim) on each lexical result row.
- Expandable result rows revealing `matchExplanation` and `matchedFactors` chips.
- `AI category` badge on each result row (visible on wider screens).
- `Entity / person / org…` filter input in the Filters panel.
- Example queries shown for both Lexical+NL and Semantic modes.
- History entries now show "N result(s)" count on a second line.
- Save-search input now responds to Enter key.

#### Tests
- `ai/__tests__/search.test.ts` — 89-test suite covering: v1 compatibility,
  domain-specific patterns, precise size parsing, extension shortcuts, date
  parsing (relative + absolute), entity-mention patterns, confidence/applied-
  filter reporting, compound multi-filter queries.
- `search/__tests__/searchService.test.ts` — extended with `buildFilters`
  (extensions, mentionedEntity, dateFrom/dateTo, confidence, overrides),
  `shouldFallbackToPlainText` (entity/extension/findingType structured hits),
  `filtersToWhereClause` (extensions[], findingTypes[], mentionedEntity,
  duplicatesOnly, empty-entity skip), and `scoreFindings` (12 scenarios:
  relevance range, sort order, matchedFactors, matchExplanation, AI category
  and duplicate boosts).

### Fixed
- Codegen script now strips the stale `export * from './generated/types'`
  re-export that Orval was regenerating into `lib/api-zod/src/index.ts` on every
  run, causing TS2308 duplicate-export errors in `typecheck:libs`.
- Entity-mention extraction now uses the original (non-lowercased) query string
  to preserve the entity name's original capitalisation (e.g. `Kennards` not
  `kennards`).

---

## [v0.6.0-alpha] — 2026-07-10 — Unified Search, Findings Review Workflow, Document Extraction

### Added

#### Schema
- `searchHistory` — every executed search query (raw text + resolved filters), most recent first
- `savedSearches` — user-named, re-runnable searches with the same filter shape as history
- `findings.reviewStatus` (`new` / `reviewed` / `accepted` / `rejected` / `ignored` / `quarantined`) —
  additive alongside the pre-existing `findingStatus` (safe_delete/review/duplicate/ignored), which is
  unchanged and still drives dedupe/backward-compat display
- `findingAudit` — append-only log of every review-state transition (who/what/when/from/to)
- `actionQueue` — proposed-only action rows (`move`/`archive`/`delete`/`keep`) created when a finding is
  "accepted"; never auto-executed, only ever dismissed or left pending
- `extractedText` — per-finding extracted text/OCR output, kept separate from `findings`
- `entities` — heuristic entity extraction results (people/orgs/dates/invoice#/case ref/amounts) linked
  to an `extractedText` row
- `userSettings` — singleton row (id=1) with extraction/OCR/local-only/cloud-consent toggles; disabling
  `localOnlyProcessing` requires `cloudConsent: true` (409 otherwise)

#### Unified Search
- `searchService.ts` — pure filter-building + query execution, wraps the existing NL interpreter
  (`interpretSearchQuery`) and layers on editable filters (path/extension/category/aiCategory/tags/risk/
  size/date range/scanId)
- `GET /search`, `GET|POST /search/history`, `GET|POST|DELETE /search/saved` routes
- `/search` page — NL query box with an editable, explainable filter breakdown, recent history, and
  saved searches
- Global command palette (⌘/Ctrl+K) — navigate to any page, jump to duplicates or findings review, or
  start a sample scan. No destructive commands are exposed (no clear-findings, no delete)

#### Findings Review Workflow
- Review-state transition endpoints on the findings route: mark reviewed / accept / reject / ignore-once
  / ignore-permanently, individually and in bulk. Every transition writes a `findingAudit` row; `accept`
  additionally queues an `actionQueue` row (never executes the action)
- Findings page gained per-row + "select all" checkboxes, a bulk action bar, per-finding review action
  buttons, and a collapsible audit log viewer per finding
- New `/action-queue` page — lists proposed actions with a "Dismiss" control; dismissing only removes the
  row from the queue and never touches the filesystem

#### Document Extraction / OCR Architecture
- `extraction/` module: extractor interface with trivial-read implementations (txt/csv/json/md/source),
  a lightweight PDF text extractor, and an OCR provider abstraction (offline/local default; a cloud path
  exists but stays disabled unless `cloudConsent` is explicitly set)
- Sensitive-content detectors (legal/banking/medical/identity/API keys/passwords/private keys) using the
  same regex/keyword heuristic style as `LocalRuleProvider`
- Heuristic entity extraction (people/orgs/dates/invoice#/case ref/amounts)
- Extraction is strictly per-file, on-demand — there is no bulk or background extraction/OCR path
- AI summaries over extracted text are opt-in per document ID and require cloud consent

### Notes
- No new destructive or automatic file operations were introduced anywhere in this release. `accept`
  only ever queues a proposal; `dismiss` only ever removes a queue row.

---

## [v0.5.0-alpha] — 2026-07-10 — Staged Duplicate Detection

### Added

#### Schema
- New `fileHashes` table — a content-hash cache keyed by absolute path, storing
  `sizeBytes` / `modifiedAt` / `hash` / `algo`. Re-scans reuse a cached hash instead of
  re-reading a file when its size and modified time are unchanged
- `duplicateGroups` gained `hash`, `confidence` (always `1.0` — this pipeline only ever
  groups on a cryptographic hash match), `explanation` (human-readable grouping reason),
  and `canonicalFindingId` (the user- or heuristically-selected "keep this one" file)
- `duplicateGroups.status` gained a `false_positive` value, additive alongside `pending` /
  `resolved` / `ignored`
- `findings` gained `duplicateGroupId`, linking each duplicate finding directly to its
  group (indexed) — this replaces the old, never-populated `duplicateGroupFiles` /
  `files` table link as the source of group membership
- `scans` gained `hashesComputed` / `hashesTotal` for hashing-stage progress reporting

#### Scanner
- New staged duplicate-detection pipeline (`scanner/duplicateDetector.ts`), replacing the
  old inline per-file MD5 hashing:
  1. group candidates by exact file size (an instant, free filter — different sizes can
     never be duplicates)
  2. within a size group, split further by extension once the group is large enough that
     the split meaningfully cuts the number of hashes needed
  3. only files that survive both stages are ever read and hashed, with SHA-256
     (previously MD5)
  4. hashes are cached by path + size + modified time, so unchanged files are never
     re-read on subsequent scans
- Cooperative cancellation: hashing polls the scan's status between files (same
  cancel-check cadence as the file walk) and can abort an in-flight file read via
  `AbortSignal`; a cancelled scan is persisted with `status: "cancelled"` rather than
  silently dropping progress
- Progress reporting: `scans.hashesComputed` / `hashesTotal` update as hashing proceeds,
  mapped to the tail of the scan's overall progress percentage
- `SKIP_DIRS` extended with more build/cache/package-internal directories (`out`,
  `target`, `.parcel-cache`, `.output`, `.vercel`, `.svelte-kit`, `.expo`, `.gradle`,
  `.yarn`, `.pnp`, `vendor`, `Pods`, `.mypy_cache`) on top of the existing `node_modules`,
  `.git`, `build`, `dist`, and cache directories

#### API
- `GET /duplicates` gained a `sort` param (`wastedBytes` default, or `createdAt`) and
  `false_positive` as a filterable status
- `DuplicateGroup` response now includes `members` (finding-based, not the old unused
  `files` table), `wastedBytes` (total size minus one canonical copy), `confidence`,
  `explanation`, and `canonicalFindingId`
- `POST /duplicates/:id/resolve` gained a `false_positive` action (alongside `keep_one` /
  `ignore`) and `keepFindingId` to select which copy to treat as canonical

#### UI
- Organise page duplicate cards: sorted by wasted space (largest first), show the group's
  explanation and confidence, let the user click any member to select it as the preferred
  original ("Keep Selected"), and add a "Not a duplicate" (false positive) action alongside
  Ignore

#### Testing
- `scanner/__tests__/duplicateDetector.test.ts` — identical files, same-name-but-different-
  content, same-size-but-different-content, cached-hash reuse (including cache
  invalidation on mtime change), and cancelled hashing mid-pipeline

### Safety
- Duplicate detection never deletes files — resolving a group only records which copy to
  keep (`canonicalFindingId`) and a saveable-bytes estimate; actual cleanup remains a
  future, explicitly confirmed action (tracked in the Backlog)

### Removed
- Old inline MD5 hashing in `realScanner.ts`, and the unused `detectDuplicates()` /
  hash-map-based duplicate grouping in `findingsEngine.ts` — both replaced by the staged
  SHA-256 pipeline above

## [v0.4.0-alpha] — 2026-07-10 — Persistent Indexing & Scan History

### Added

#### Schema
- New tables: `scanRoots` (quick re-scan targets, upserted on every scan), `aiClassifications`
  (append-only history of every AI classification run per finding), `semanticTags`
  (normalized tag rows derived from `findings.aiTags`), `ignoredFindings` (additive-only —
  never deletes the underlying finding)
- `findings`, `files`, `duplicateGroups`, and `activity` gained a `scanId` foreign key so
  every record can be traced back to the scan that produced it
- `findings` gained `fileCreatedAt` / `fileModifiedAt` (filesystem timestamps, distinct from
  `createdAt` which is row-insert time) and `riskLevel` (display-only heuristic — never
  drives automatic action)
- New indexes on `findings` (`path`, `name`, `extension`, `aiCategory`, `fileModifiedAt`,
  `hash`, `scanId`) to keep the Findings/Analyse filters fast as scan history grows

#### API
- `PATCH /findings/:id/ignore` and `/unignore` — dismiss/restore a finding without ever
  deleting its row or scan history
- `GET /scan-roots` — previously-scanned paths with scan counts, for quick re-scan
- `GET /scans`, `GET /scans/:id`, and `GET /findings?scanId=` now form the full scan
  history + reopen data path

#### UI
- New **Scan History** page (`/scan-history`, ⌘6) — every completed scan with status,
  file/byte counts, findings count, duration, and a **Reopen** action
- Reopening a scan deep-links to `/findings?scanId=<id>`, which scopes the Findings page
  to that scan and shows a "Scan #N" badge with a way to clear the filter

#### Tooling
- `pnpm --filter @workspace/scripts run seed` — seeds three demo scans with findings
  across every type/status, a duplicate group, AI classifications, semantic tags, and
  activity events. Never touches file contents or secrets — structural metadata only

#### Testing
- `riskLevelFor.test.ts` — heuristic risk classification for every finding type/status
  combination
- `routes/__tests__/findings.test.ts` — ignore/unignore against an isolated per-test-run
  SQLite database (via `drizzle-kit push`), asserting the finding row is never deleted

### Safety
- Ignoring a finding is additive (`ignoredFindings` insert + status flip) — the finding
  row and its scan history are preserved, satisfying "no deleting historical scans without
  confirmation"
- `DELETE /findings/clear` remains a pre-existing, unconfirmed bulk-delete endpoint — noted
  in the Backlog as needing a confirmation step; left unchanged in this pass

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
