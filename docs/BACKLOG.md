# Sentinel — Backlog

Items are ordered by priority within each category.

## Sprint 3 Candidates

### AI Intelligence
- [ ] Connect `OpenAIProvider` — wire `OPENAI_API_KEY` from env, parse structured JSON response with Zod, cache results by (name, ext, sizeRange)
- [ ] Connect `EmbeddingsProvider` — embed filename+path, compare cosine similarity against reference category vectors
- [ ] Findings UI: filter by AI category (add AI category filter tabs alongside type/status tabs)
- [ ] AI confidence threshold setting — hide/show low-confidence classifications
- [ ] User feedback loop — "Correct Category" button writes correction to DB for future training
- [ ] AI reclassify button — re-run AI on existing findings without re-scanning
- [ ] AI summary panel on Dashboard — breakdown of AI categories across all findings
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
- [ ] Incremental scan — only re-process changed files (mtime / inode cache)
- [ ] Watch mode — trigger re-scan on filesystem change events
- [ ] `.gitignore`-aware scanning
- [ ] Symbolic link handling (follow or skip, configurable)
- [ ] Hash algorithm option — xxHash for speed on large volumes

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
- [ ] Content-aware dedup — perceptual hash for images (pHash)
- [ ] Cross-directory duplicate grouping
- [ ] Duplicate folder detection

## Findings

- [ ] Finding age — show how long a lock file has existed (mtime from FS)
- [ ] Severity scoring — weighted by type, size, age, and AI confidence
- [ ] Findings webhooks — notify Slack/Discord on scan complete
- [ ] Duplicate space savings — show bytes saveable per group

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
- [ ] Integration tests for scan API routes
- [ ] E2E tests with Playwright
- [ ] CI pipeline (GitHub Actions)
- [ ] Docker image for self-hosting
- [ ] Health check endpoint with DB connectivity check

## Desktop / Platform

- [ ] Tauri native build — `.dmg` for macOS, `.exe` for Windows
- [ ] Native file picker via Tauri dialog plugin
- [ ] System tray integration
- [ ] Local embeddings (Ollama) for fully offline AI
- [ ] OCR for scanned PDFs
