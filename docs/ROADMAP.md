# Sentinel — Roadmap

## v0.1.0-alpha — Current (MVP)

**Goal:** Prove the core scan + findings loop works end-to-end.

- [x] Dark-themed React + Vite frontend
- [x] Express 5 API with PostgreSQL + Drizzle ORM
- [x] Simulated scan engine (for demo/cloud environments)
- [x] Real filesystem scanner (walks workspace directories)
- [x] Findings engine: empty folders, zero-byte files, `.idlk`, `.locked`, installers, archives, large files
- [x] Duplicate detection via MD5 hash
- [x] Sample data directory with representative test fixtures
- [x] Dashboard with live metrics + activity feed
- [x] Analyse page — filterable file browser
- [x] Organise page — duplicate resolution UI
- [x] Findings page — findings table with type/status filters
- [x] Reports page — charts + scan history
- [x] Keyboard shortcuts ⌘1–⌘5

---

## v0.2.0 — Beta

**Goal:** Real-world usability on macOS/Linux desktops.

- [ ] Native desktop wrapper (Electron or Tauri)
- [ ] Real path selector (native file dialog)
- [ ] Background scan daemon (watch mode)
- [ ] Progressive scanning with pause/resume
- [ ] Findings actions: move to trash, rename, archive
- [ ] Smart categories (ML-based classification)
- [ ] Category rules engine (custom rules per extension)
- [ ] Export scan report to PDF/CSV
- [ ] iCloud Drive and external volume support

---

## v0.3.0 — AI Integration

**Goal:** Natural language interface over the file system.

- [ ] AI-powered file search ("find all PDFs from last year related to tax")
- [ ] AI category suggestions with confidence scores
- [ ] Smart duplicate resolver (keeps most recently modified or highest quality)
- [ ] Anomaly detection (files that don't fit expected patterns)
- [ ] Auto-rename suggestions (consistent naming conventions)

---

## v0.4.0 — Collaboration & Sharing

**Goal:** Teams and organisations.

- [ ] Multi-user workspace (shared scans, shared findings)
- [ ] Team file policies (compliance rules, retention schedules)
- [ ] Audit log for compliance reporting
- [ ] Cloud storage connectors (Dropbox, Google Drive, S3)
- [ ] REST API for third-party integrations

---

## v1.0.0 — Production

**Goal:** Stable, trusted, production-ready.

- [ ] End-to-end encryption for scan data
- [ ] macOS App Store distribution
- [ ] Enterprise SSO
- [ ] 100% offline mode
- [ ] SLA-backed cloud sync
