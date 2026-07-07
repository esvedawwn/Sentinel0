# Sentinel — Backlog

Items are ordered by priority within each category.

## Scanner

- [ ] Watch mode: re-scan on filesystem change events
- [ ] Progress streaming via SSE (Server-Sent Events)
- [ ] Parallel scanning (worker_threads for large directories)
- [ ] Configurable skip list (user-defined directories to ignore)
- [ ] Symbolic link handling (follow or skip, configurable)
- [ ] `.gitignore`-aware scanning
- [ ] Hash algorithm options (MD5 → xxHash for speed)
- [ ] Incremental scans (only re-process changed files)
- [ ] macOS extended attributes (xattr) parsing for metadata

## Findings

- [ ] Per-finding action buttons (Mark as kept, Move to trash)
- [ ] Bulk action: select all safe-delete findings, confirm once
- [ ] Finding age: show how long a lock file has existed
- [ ] Severity scoring (weighted by type + size + age)
- [ ] Findings export to CSV / JSON
- [ ] Findings webhooks (notify Slack/Discord on scan complete)

## Duplicates

- [ ] Content-aware dedup (perceptual hash for images)
- [ ] Smart keep rule (keep newest / largest / lowest path depth)
- [ ] Cross-directory duplicate grouping
- [ ] Duplicate folder detection (entire directory subtree duplicated)

## Dashboard

- [ ] Bytes recoverable from all findings
- [ ] Trend chart: files over time, findings over time
- [ ] Per-category health score
- [ ] Quick actions panel (one-click common operations)

## Analyse

- [ ] Column sort (by name, size, category, date)
- [ ] Bulk tag editing
- [ ] Preview panel for images/text files
- [ ] Path breadcrumb navigation
- [ ] Export filtered view to CSV

## Organise

- [ ] Batch duplicate resolution (resolve all safe-delete dupes at once)
- [ ] "Move to Archive" action (non-destructive alternative to delete)
- [ ] Smart rename suggestion for merged files

## Reports

- [ ] Date range picker for scan history chart
- [ ] Space reclaimed over time trend
- [ ] Top 10 largest files
- [ ] Category size breakdown (pie/donut chart)
- [ ] Exportable PDF report

## Infrastructure

- [ ] Unit tests for findingsEngine (pure functions, easy to test)
- [ ] Integration tests for scan API routes
- [ ] E2E tests with Playwright
- [ ] CI pipeline (GitHub Actions)
- [ ] Docker image for self-hosting
- [ ] Health check endpoint with DB connectivity
