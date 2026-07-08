# Sentinel — Roadmap

## v0.1.x-alpha — Shipped

**Goal:** Prove the core scan + findings loop works end-to-end.

- [x] Dark-themed React + Vite frontend
- [x] Express 5 API with SQLite + Drizzle ORM
- [x] Simulated scan engine (for demo/cloud environments)
- [x] Real filesystem scanner (walks workspace directories)
- [x] Findings engine: empty folders, zero-byte files, `.idlk`, `.locked`, installers, archives, large files
- [x] Duplicate detection via MD5 hash
- [x] Sample data directory with representative test fixtures
- [x] Dashboard with live metrics + activity feed
- [x] Analyse page — filterable file browser
- [x] Organise page — duplicate resolution UI
- [x] Findings page — findings table with type/status filters + search
- [x] Reports page — charts + scan history
- [x] Keyboard shortcuts ⌘1–⌘6
- [x] Settings page (⌘6) — scan configuration reference
- [x] SQLite migration — offline-ready, desktop-compatible database

---

## v0.2.0-alpha — Current

**Goal:** AI-ready intelligence layer, desktop packaging.

- [x] AI module architecture — typed interfaces, provider abstraction
- [x] `LocalRuleProvider` — offline rule-based classifier (11 categories, confidence scores, explanations)
- [x] `OpenAIProvider` placeholder — ready for GPT-4o integration
- [x] `EmbeddingsProvider` placeholder — ready for semantic similarity
- [x] Scanner integration — every finding gets AI classification at scan time
- [x] Findings UI — AI category column, confidence bar, explanation, tags
- [x] Tauri desktop scaffold — Node.js SEA sidecar server design
- [ ] Native desktop app build (macOS .dmg, Windows .exe)
- [ ] Native path selector (system file dialog via Tauri)
- [ ] Findings actions: move to trash, rename, archive (with confirmation)

---

## v0.3.0 — AI Enrichment

**Goal:** Connect live AI providers and add natural language features.

- [ ] OpenAI GPT-4o integration — structured classification prompt, response validation
- [ ] Semantic embeddings — `text-embedding-3-small` for similarity-based classification
- [ ] Active learning — user corrections fed back as training signals
- [ ] AI-powered file search ("find all PDFs from last year related to tax")
- [ ] Smart duplicate resolver — keep most recently modified or highest quality
- [ ] Anomaly detection — files that don't fit expected patterns
- [ ] Auto-rename suggestions — consistent naming conventions
- [ ] Batch AI reclassify — re-run AI on existing findings with new provider

---

## v0.4.0 — Collaboration & Sharing

**Goal:** Teams and organisations.

- [ ] Multi-user workspace (shared scans, shared findings)
- [ ] Team file policies (compliance rules, retention schedules)
- [ ] Audit log for compliance reporting
- [ ] Cloud storage connectors (Dropbox, Google Drive, S3)
- [ ] REST API for third-party integrations
- [ ] Exportable PDF/CSV scan reports

---

## v1.0.0 — Production

**Goal:** Stable, trusted, production-ready.

- [ ] End-to-end encryption for scan data
- [ ] macOS App Store distribution
- [ ] Enterprise SSO
- [ ] 100% offline mode with optional cloud sync
- [ ] SLA-backed cloud sync
