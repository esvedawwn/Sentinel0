# Changelog

All notable changes to Sentinel are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

#### Quality pipeline
- **ESLint** (v9 flat config) across the entire monorepo — TypeScript-ESLint recommended
  rules + React Hooks plugin for the frontend; per-section rule tuning.
- **Prettier** config (`.prettierrc`, `.prettierignore`) — 100-char print width, ES5 trailing
  commas, LF line endings.
- **Vitest workspace** (`vitest.workspace.ts`) — single `pnpm test` command runs both the
  api-server (Node / fork-isolated pool) and sentinel (jsdom) suites.
- Per-package `vitest.config.ts` for `artifacts/api-server` and `artifacts/sentinel`.
- `@vitest/coverage-v8` coverage provider in both testable packages; `--coverage` generates
  text, LCOV, and HTML reports.
- **New root scripts**: `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`,
  `format:check`.
- **New workspace scripts** in api-server and sentinel: `test:watch`, `test:coverage`, `lint`,
  `lint:fix`, `format`.
- **`findingsEngine.test.ts`** — 20 unit tests for `classifyFile`, `classifyEmptyFolder`, and
  `classifyDuplicate`; covers all finding types, custom thresholds, and metadata preservation.
- **`utils.test.ts`** (sentinel) — 30 unit tests for `formatBytes`, `formatNumber`,
  `formatTimestamp`, `statusColor`, `statusLabel`, `activityIcon`, and `cn`.
- **`FilePreviewTooltip.test.tsx`** (sentinel) — 7 React component tests using
  `@testing-library/react` + fake timers: hover delay, early-leave cancellation, category
  display, portal rendering.
- `artifacts/sentinel/src/test-setup.ts` wires `@testing-library/jest-dom` matchers into
  vitest's `expect`.

#### UI
- **FilePreviewTooltip** — lo-res pixelated file preview card on hover in Analyse and
  Findings pages; extension colour coding, metadata rows, portal rendering with smart edge
  detection.

#### Backend / scanner
- `projectService.ts` rewritten — `semanticSimilarity` signal (cosine of Float32 embedding
  chunks), user-correction map (approved/rejected pairs), updated WEIGHTS for 7 signals
  summing to 1.0, `rejectCandidate` export.

#### Desktop
- `Cargo.toml` updated — added `tauri-plugin-log`, `tauri-plugin-updater`,
  `tauri-plugin-dialog`, `log = "0.4"`.

---

## [0.1.0] — 2026-07-10

### Added
- Initial Sentinel release: Dashboard, Analyse, Organise, Findings, Search, Action Queue,
  Reports, Scan History, Settings pages.
- Real filesystem scanner (`realScanner.ts`) with staged duplicate detection pipeline.
- OpenAPI-first API with Orval code generation.
- AI classification layer: LocalRuleProvider (offline), OpenAI, Embeddings providers.
- Unified search service with NL interpreter and editable filter breakdown.
- Findings review workflow: per-finding state machine, bulk actions, audit log.
- Document extraction / OCR architecture (backend only).
- Global ⌘/Ctrl+K command palette (navigation + safe actions only).
- Keyboard shortcuts ⌘1–⌘9 for all pages.
- Always-dark theme (`#111111` bg, `#1A1A1A` panels, `#34D399` accent).
