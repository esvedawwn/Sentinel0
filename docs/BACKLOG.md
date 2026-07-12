# Sentinel — Backlog

Items are ordered by priority within each category.

## Unified Search / Command Palette / Findings Review / Extraction

- [x] Unified search service + `/search` page + saved searches + history (2026-07-10)
- [x] Global ⌘/Ctrl+K command palette, non-destructive commands only (2026-07-10)
- [x] Findings review workflow: states, bulk actions, per-finding audit log (2026-07-10)
- [x] Action queue (`/action-queue`) for proposed-only accept actions (2026-07-10)
- [x] Extraction/OCR architecture: extractors, OCR abstraction, sensitive-content + entity
      detection, privacy settings (2026-07-10)
- [ ] Settings UI page for `userSettings` (extraction/OCR/local-only/cloud-consent toggles) —
      backend + schema exist, no dedicated settings section built yet
- [ ] Frontend UI for viewing extracted text / entities / sensitive-content flags per finding
      (extraction is currently backend-only, triggered on demand, no results viewer)
- [ ] Action queue: allow marking an item `completed` from the UI once a user has manually
      performed the proposed action outside Sentinel (currently only `pending`→`dismissed`)
- [ ] Command palette: fuzzy/scored matching instead of simple substring filter
- [ ] Saved searches: allow editing an existing saved search's filters, not just re-running it

## Sprint 3 — Completed

- [x] Simulate scanner populates all persistence tables: `files` (with `scanId`
      FK), `findings`, `duplicate_groups`, `ai_classifications`, `semantic_tags`,
      `scan_roots`, `activity` (2026-07-12)
- [x] Real scanner writes every walked file to `filesTable` with `scanId` FK so
      the Analyse page is populated after a real scan (2026-07-12)
- [x] Startup cleanup: any scan left `"running"` on server restart is marked
      `"failed"` before the HTTP server binds (2026-07-12)
- [x] `FindingType` / `FindingStatus` / `RiskLevel` properly imported from
      `@workspace/db` — no more widened-string typecheck errors on Drizzle
      insert overloads (2026-07-12)
- [x] DB schema pushed to SQLite (`db push`) — `files`, `scans`, and all related
      tables now match the Drizzle schema; "Failed query" errors resolved (2026-07-12)
- [x] `docs/PERSISTENCE.md` written — covers all table writers, progress
      formula, batch flush, startup cleanup, and schema push workflow (2026-07-12)

## Sprint 3 Candidates (remaining)

### AI Intelligence
- [ ] Connect `OpenAIProvider` — wire `OPENAI_API_KEY` from env, parse structured JSON response with Zod, cache results by (name, ext, sizeRange)
- [ ] Connect `EmbeddingsProvider` — embed filename+path, compare cosine similarity against reference category vectors
- [ ] Findings UI: filter by AI category (add AI category filter tabs alongside type/status tabs)
- [ ] AI confidence threshold setting — hide/show low-confidence classifications
- [ ] User feedback loop — "Correct Category" button writes correction to DB for future training
- [ ] AI reclassify button — re-run AI on existing findings without re-scanning
- [ ] AI summary panel on Dashboard — breakdown of AI categories across all findings
- [x] Developer-facing AI diagnostics (active provider, provider availability, local/cloud
      mode, last AI error, last classification duration) — added to Settings page (2026-07-10)
- [ ] Surface `GET /api/ai/status` as a persistent Local/Cloud/Offline badge in the UI header
- [ ] Wire `GET /api/ai/search` into the Findings search box as an opt-in "smart search" toggle
- [ ] Suggested destination "Apply" flow — confirmation dialog + a real (currently unimplemented) move operation
- [ ] Per-category color legend / key on the Findings page for the full 24-category set

See `docs/AI_ARCHITECTURE.md`, `docs/AI_PRIVACY.md`, and `docs/AI_ROADMAP.md` for the current AI layer design and constraints.

### Findings Actions (highest value)
- [ ] Per-finding "Mark as Kept" — persist ignored status, hide from default view
- [ ] Per-finding "Move to Trash" — preview mode only; log action, do not execute
- [ ] Bulk action: select all safe-delete findings, confirm once with count + size
- [ ] Findings export to CSV / JSON

### Settings Persistence
- [ ] Store user settings in DB (or localStorage for local mode)
- [ ] Honour detection toggle settings at scan time
- [ ] Honour large-file threshold from settings (currently hardcoded)
- [ ] Configurable skip-dir list (add/remove entries)

### Scanner Improvements
- [ ] Progress streaming via SSE — real-time file count in UI
- [ ] Parallel scanning with `worker_threads` for large directories
- [x] Incremental scan — hash cache keyed by (path, size, mtime) reused across scans
      (2026-07-10); a full incremental scan (skip unchanged files entirely) is still open
- [ ] Watch mode — trigger re-scan on filesystem change events
- [ ] `.gitignore`-aware scanning
- [ ] Symbolic link handling (follow or skip, configurable)
- [ ] Hash algorithm option — xxHash for speed on large volumes (SHA-256 is used today for
      collision-safety; xxHash would trade some safety margin for a large speed gain)
- [ ] Real destructive "clean up duplicates" flow — preview affected paths, require typed
      confirmation, then delete/move non-canonical copies. Today `keep_one` only records
      intent (`canonicalFindingId` + saveable bytes); no files are ever removed

## AI

- [ ] LocalRuleProvider: add more language/locale patterns (non-English keywords)
- [ ] LocalRuleProvider: add size-based heuristics for media files (video ≥ 500 MB → likely uncompressed)
- [ ] LocalRuleProvider: add mtime-based heuristics (very old temp files → higher junk confidence)
- [ ] AI provider hot-swap at runtime without server restart
- [ ] AI metrics route — `GET /api/ai/stats` — distribution of categories and confidence across findings
- [ ] Embeddings: local model support (Ollama, llama.cpp) via `EMBEDDINGS_BASE_URL`

## Scanner

- [ ] macOS extended attributes (xattr) parsing for metadata
- [ ] Two-pass progress calculation (count first, then walk)
- [ ] Content-aware dedup — perceptual hash for images (pHash) — would raise confidence
      below 1.0 and needs a UI treatment for "likely" vs. "certain" duplicates
- [x] Cross-directory duplicate grouping — the staged pipeline groups by content hash
      across the entire scanned tree, not just within one directory (2026-07-10)
- [ ] Duplicate folder detection

## Findings

- [ ] Finding age — show how long a lock file has existed (mtime from FS)
- [ ] Severity scoring — weighted by type, size, age, and AI confidence
- [ ] Findings webhooks — notify Slack/Discord on scan complete
- [x] Duplicate space savings — show bytes saveable per group (`wastedBytes` on
      `DuplicateGroup`, surfaced in the Organise UI) (2026-07-10)

## Dashboard

- [ ] Trend chart — findings over time, files over time
- [ ] Per-category health score
- [ ] Quick actions panel — one-click common operations
- [ ] Bytes recoverable breakdown by finding type

## Analyse

- [ ] Column sort — by name, size, category, date
- [ ] Bulk tag editing
- [ ] Preview panel — image thumbnails, text file preview
- [ ] Path breadcrumb navigation
- [ ] Export filtered view to CSV

## Organise

- [ ] Batch duplicate resolution
- [ ] "Move to Archive" — non-destructive alternative
- [ ] Smart rename suggestion for merged files

## Reports

- [ ] Date range picker for scan history chart
- [ ] Space reclaimed over time trend
- [ ] Top 10 largest files
- [ ] Category size breakdown (pie/donut chart)
- [ ] Exportable PDF report

## Infrastructure

- [ ] Unit tests for `findingsEngine` (pure functions, no I/O)
- [ ] Unit tests for `LocalRuleProvider` (pure function — trivially testable)
- [x] Integration tests for scan API routes — ignore/unignore route tests added with an
      isolated SQLite DB per test run (2026-07-10)
- [ ] E2E tests with Playwright
- [ ] CI pipeline (GitHub Actions)
- [ ] Docker image for self-hosting
- [ ] Health check endpoint with DB connectivity check
- [ ] Confirmation prompt before `DELETE /findings/clear` — currently deletes findings
      immediately with no confirmation step (see Safety note in ARCHITECTURE.md)

## Persistent Indexing (Sprint — Scan History)

- [x] Extended schema: `scanRoots`, `aiClassifications`, `semanticTags`,
      `ignoredFindings` tables; `findings`/`files`/`duplicates`/`activity` gained
      `scanId` FKs, filesystem timestamps, and `riskLevel` (2026-07-10)
- [x] Scanner populates AI classification history + semantic tags per finding, and
      upserts scan roots on every run (2026-07-10)
- [x] `PATCH /findings/:id/ignore` / `/unignore` — additive-only, never deletes the
      finding row (2026-07-10)
- [x] `GET /scan-roots` endpoint (2026-07-10)
- [x] Scan History page (`/scan-history`) with reopen-in-Findings deep link via
      `?scanId=` query param (2026-07-10)
- [x] Demo seed script (`pnpm --filter @workspace/scripts run seed`) populates scans,
      findings, duplicates, AI classifications, and activity (2026-07-10)
- [ ] Paginate `GET /scans` with a `total` count in the response (currently returns a
      bare array; Scan History page infers "has more" from page fullness)
- [ ] Scan comparison view — diff findings between two scans of the same root

## Desktop / Platform

- [x] Tauri native build source — `lib.rs`, `Cargo.toml`, `tauri.conf.json`, SEA
      build pipeline all complete; compiles to `.dmg` on macOS with Rust/Cargo (2026-07-12)
- [x] Native file picker via Tauri dialog plugin — `pick_folder` IPC command in
      `lib.rs`, `isDesktop()`/`pickFolder()` bridge in `src/lib/desktop.ts`,
      "Browse…" button on Dashboard and Settings (2026-07-12)
- [x] Settings page — `POST /scan-roots`, `DELETE /scan-roots/:id`, approved folder
      management UI, live processing/privacy toggles wired to `PATCH /settings` (2026-07-12)
- [x] Scan progress banner — `ScanProgressBanner` component with live polling, cancel
      button, and per-scan stats injected into Dashboard (2026-07-12)
- [ ] macOS `.dmg` distribution — requires Rust/Cargo build on macOS hardware
- [ ] System tray integration
- [ ] Local embeddings (Ollama) for fully offline AI
- [ ] OCR for scanned PDFs
- [ ] Windows `.exe` build
