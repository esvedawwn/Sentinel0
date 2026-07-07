# Changelog

All notable changes to Sentinel are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [v0.1.1-alpha] — 2026-07-07 — Sprint 1 Hardening

### Fixed
- **Double-counting bug** — `totalFindings` in `realScanner.ts` was adding `dupFindings.length` twice (they were already pushed into `findings[]` at the dedup pass)
- **OOM risk** — `computeHash` switched from `fs.readFile` (entire file loaded into memory) to `fs.createReadStream` (streaming MD5); safe for files up to 100 MB
- **Archive type** — archives (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.tgz`, `.bz2`, `.xz`) were incorrectly classified as `type: "installer"`; now use distinct `type: "archive"`
- **`formatBytes` duplication** — `Findings.tsx` defined its own copy; now imports canonical version from `@/lib/utils`
- **Dead code** — `artifacts/sentinel/src/lib/formatters.ts` deleted (unused, duplicated `utils.ts` functions)
- **Empty folder detection** — `countChildren` now excludes `.DS_Store` and `._*` macOS shadow files; previously a folder with only a `.DS_Store` would not be flagged as empty
- **`simulateScan` separation** — moved from `routes/scans.ts` into `scanner/simulateScanner.ts` (single responsibility)
- **`INSTALLER_EXTS`** — removed `.sh` (shell scripts are scripts, not installers)

### Added
- **`archive` finding type** — separate DB enum value, distinct badge colour (`#C084FC`), and dedicated "Archives" filter tab on Findings page
- **Search on Findings** — `GET /api/findings?search=` parameter filters by name or path (`ilike`); UI has a search input (press Enter to commit, Escape to clear)
- **Settings page** (⌘6) — scan configuration reference: detection toggles, large-file threshold input, skip-dir chip list, about panel
- **`bytesRecoverable`** — new field on `GET /api/dashboard/summary`; sums `size_bytes` of all non-duplicate findings; shown on Dashboard as "Recoverable" metric card
- Settings nav item pinned to sidebar bottom, above system status indicator

### Schema
- `finding_type` enum: added `"archive"` value (DB migration applied)
- `GET /api/findings`: added `search?: string` query parameter
- `DashboardSummary`: added `bytesRecoverable: integer`

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
- `fileWalker.ts` — async generator that walks the filesystem non-blocking
- `findingsEngine.ts` — pure classifier functions for all finding types
- `realScanner.ts` — orchestrator with DB progress updates and activity events
- Skips: `node_modules`, `.git`, `dist`, `build`, `.cache` and related dirs
- MD5 hashing for duplicate detection (files < 100 MB)

#### Findings Detection
- **empty_folder** — directories with zero children
- **zero_byte** — files with 0-byte size (status: safe_delete)
- **idlk_file** — Adobe InDesign lock files (status: safe_delete)
- **locked_file** — generic `.locked` files (status: review)
- **installer** — `.dmg`, `.pkg`, `.exe`, `.msi`, `.deb`, `.rpm` (status: review)
- **large_file** — files exceeding threshold (50 MB real, 1 MB sample)
- **duplicate** — identical MD5 hash across multiple files

#### Sample Data
- `sample-data/` — representative test fixtures:
  - InDesign lock files, generic lock files
  - Duplicate file pairs (PSD, ZIP, JPG)
  - Zero-byte files, empty folders
  - Installer placeholders (DMG, PKG)
  - Large file (1.5 MB binary)
  - Legal, banking, design, media files

#### API Routes
- `GET /api/healthz` — health check
- `GET/POST /api/scans` — list / start scans (modes: real, sample, simulate)
- `GET /api/scans/:id` — scan details
- `POST /api/scans/:id/cancel` — cancel running scan
- `GET /api/findings` — list findings with filters
- `GET /api/findings/summary` — counts by type and status
- `DELETE /api/findings/clear` — clear findings (by scanId or all)
- `GET /api/dashboard/*` — summary, activity, category breakdown, attention
- `GET /api/files` + `PATCH /api/files/:id` — file browser + category update
- `GET /api/duplicates` + `POST /api/duplicates/:id/resolve`
- `GET /api/categories` — hardcoded category definitions
- `GET /api/activity`
- `GET /api/reports/overview` + `GET /api/reports/scan-history`

#### Frontend
- Always-dark UI (#111111 bg, #1A1A1A panels, #222222 cards)
- Inter font, monospaced data values
- **Dashboard** — metrics, scan progress bar, activity feed, attention panels
- **Analyse** — filterable file browser, inline detail panel, editable category
- **Organise** — side-by-side duplicate resolution (Keep Left/Right/Ignore)
- **Findings** — real findings table with type/status filters, summary ribbon
- **Reports** — category bar chart, file type breakdown, scan history table
- Keyboard shortcuts ⌘1–⌘5 for page navigation
- "Scan Sample Data" quick action on Dashboard

#### Documentation
- `docs/VISION.md` — product vision and philosophy
- `docs/ROADMAP.md` — versioned feature roadmap
- `docs/ARCHITECTURE.md` — system design, data flow, library choices
- `docs/BACKLOG.md` — prioritised future work
- `docs/CHANGELOG.md` — this file

### Security
- Scanner is read-only — no delete, move, or rename operations
- All destructive actions are stubbed as "coming soon"
- Scanner skips workspace internals (node_modules, .git, etc.)
- No external network calls from scanner

### Known Limitations
- Real scans are scoped to the Replit workspace (no native macOS folder access)
- `sizeBytes` stored as 32-bit integer (max ~2.1 GB per file)
- No scan cancellation during hash computation phase
- Findings page loads up to 200 findings at once (no infinite scroll yet)
