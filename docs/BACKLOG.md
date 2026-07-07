# Sentinel — Backlog

Items are ordered by priority within each category.

## Sprint 2 Candidates

### Findings Actions (highest value)
- [ ] Per-finding "Mark as Kept" — persist ignored status, hide from default view
- [ ] Per-finding "Move to Trash" — preview mode only; log action, do not delete
- [ ] Bulk action: select-all safe-delete findings, confirm once with count + size
- [ ] Findings export to CSV / JSON

### Settings Persistence
- [ ] Store user settings in DB (or localStorage for local mode)
- [ ] Honour detection toggle settings at scan time (pass config to `runRealScan`)
- [ ] Honour large-file threshold from settings (currently hardcoded)
- [ ] Configurable skip-dir list (add/remove entries)

### Scanner Improvements
- [ ] Progress streaming via SSE (Server-Sent Events) — real-time file count in UI
- [ ] Parallel scanning with `worker_threads` for large directories
- [ ] Incremental scan — only re-process changed files (using mtime / inode cache)
- [ ] Watch mode — trigger re-scan on filesystem change events
- [ ] `.gitignore`-aware scanning
- [ ] Symbolic link handling (follow or skip, configurable)
- [ ] Hash algorithm option — xxHash for speed on large volumes

## Scanner
- [ ] macOS extended attributes (xattr) parsing for metadata
- [ ] Progress calculation improvement — two-pass (count first, then walk)

## Findings
- [ ] Finding age — show how long a lock file has existed (mtime from FS)
- [ ] Severity scoring — weighted by type, size, and age
- [ ] Findings webhooks — notify Slack/Discord on scan complete
- [ ] Duplicate space savings — show bytes saveable per group

## Duplicates
- [ ] Content-aware dedup — perceptual hash for images (pHash)
- [ ] Smart keep rule — keep newest / largest / shallowest path
- [ ] Cross-directory duplicate grouping
- [ ] Duplicate folder detection (entire directory subtree duplicated)

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
- [ ] Batch duplicate resolution — resolve all safe-delete dupes at once
- [ ] "Move to Archive" — non-destructive alternative to delete
- [ ] Smart rename suggestion for merged files

## Reports
- [ ] Date range picker for scan history chart
- [ ] Space reclaimed over time trend
- [ ] Top 10 largest files
- [ ] Category size breakdown (pie/donut chart)
- [ ] Exportable PDF report

## Infrastructure
- [ ] Unit tests for `findingsEngine` (pure functions, no I/O — trivial to test)
- [ ] Integration tests for scan API routes
- [ ] E2E tests with Playwright
- [ ] CI pipeline (GitHub Actions)
- [ ] Docker image for self-hosting
- [ ] Health check endpoint with DB connectivity check

## Future Platform
- [ ] Tauri desktop shell (native macOS folder access, system tray)
- [ ] Local embeddings for semantic file search
- [ ] OCR for scanned PDFs
- [ ] OpenAI-compatible API for document understanding
- [ ] Python integration for ML-based classification
