# Sentinel — Persistence Architecture

Sprint 3 fully replaced every in-memory/incomplete write path with durable
SQLite persistence via Drizzle ORM.  This document describes what is stored,
where, and how the two scanners populate the database.

---

## Tables written during a scan

| Table | Writer(s) | Key columns |
|---|---|---|
| `scans` | both scanners, `index.ts` startup | `status`, `progressPercent`, `findingsCount`, `duplicatesFound` |
| `files` | both scanners | `scanId` FK, `path`, `category`, `status`, `sizeBytes` |
| `findings` | both scanners | `scanId` FK, `type`, `findingStatus`, `riskLevel`, `reviewStatus`, AI columns |
| `duplicate_groups` | both scanners | `scanId` FK, `hashValue`, `totalSizeBytes`, `fileCount` |
| `ai_classifications` | both scanners | append-only history per finding |
| `semantic_tags` | both scanners | per-finding tags from AI output |
| `scan_roots` | both scanners | upserted: `path`, `lastScanAt`, `lastScanId` |
| `activity` | both scanners | one row per scan lifecycle event |

---

## Simulate scanner (`simulateScanner.ts`)

Runs a synthetic ~12-second, 10-step demo scan for CI/demo environments.
Produces deterministic, realistic data across all persistence tables.

### What it writes

**`scans`** — progress updated across 10 phases (0 → 100 %).  
**`files`** — 400 synthetic file records (80 per DEMO_DIR × 5 dirs), each
carrying `scanId`, `path`, `name`, `extension`, `category`, `status`,
`sizeBytes`, and a `tags` JSON array seeded from the containing directory.  
**`findings`** — 30 type-specific findings spread across 5 types:

| Type | Count | `findingStatus` | Default risk |
|---|---|---|---|
| `zero_byte` | 6 | `safe_delete` | `low` |
| `large_file` | 6 | `review` | `medium` |
| `archive` | 6 | `safe_delete` | `low` |
| `installer` | 6 | `review` | `medium` |
| `idlk_file` | 6 | `safe_delete` | `low` |

Each finding also gets AI-enriched columns (see below).

**`duplicate_groups`** — 5 groups with realistic file counts and
`totalSizeBytes` figures; each group's member count flows back to
`scans.duplicatesFound`.

**`ai_classifications`** — one append-only row per finding via
`classifyWithAI(name, ext, sizeBytes)`; the returned `category`, `confidence`,
`label`, `suggestedAction`, `reasoning`, and `tags` are written both here and
denormalized into the `findings` row.

**`semantic_tags`** — one tag row per element of the AI `tags` array, keyed by
`findingId`.

**`scan_roots`** — upserted with `lastScanAt = now()` and `lastScanId`.

**`activity`** — one `scan_completed` event at end of run.

### Progress formula

Steps 1–9 advance `progressPercent` by fixed amounts (0, 5, 15, 25, 35, 45,
55, 70, 84, 100) with ~1.2 s sleep between phases.  Step 9 ("AI analysis")
fires the AI classification loop over all findings.

---

## Real scanner (`realScanner.ts`)

Walks a real filesystem path using Node's `fs.readdir` + `statSync`.

### What it writes

**`files`** — flushed in batches of 50; each record carries the real `scanId`
FK, full `path`, `name`, `extension`, computed `category` (via
`extensionToCategory`), `status` (via `findingTypeToFileStatus`), real
`sizeBytes`, and `lastModified`.

**`findings`** — written as the walk loop identifies each finding type
(duplicate, large file, zero-byte, etc.) and after the duplicate-detection
pipeline completes.

**`duplicate_groups`** — written by `duplicateDetector.ts` after the
staged-hash pipeline (size → extension → SHA-256) resolves groups; each group
carries `scanId`, a `hashValue`, `totalSizeBytes`, `fileCount`, and the list of
member paths.

**`ai_classifications` / `semantic_tags`** — same `classifyWithAI` call as the
simulate scanner, one per finding.

**`scan_roots`** — upserted on scan completion.

**`activity`** — one row per lifecycle event (`scan_started`,
`scan_completed`, `scan_failed`).

### Progress formula

```ts
progressPercent = Math.min(84, Math.floor(filesScanned / (filesScanned + 500) * 85))
```

Asymptotically approaches 84 % during the walk; jumps to 100 % on completion.
This avoids premature 100 % on very small directories.

### Batch size and flush

Files are buffered in-memory in a `filesBatch` array and flushed via
`flushFiles()` every 50 records and once after the walk completes.  This keeps
SQLite write pressure low on large directories.

---

## Startup cleanup

`artifacts/api-server/src/index.ts` runs a top-level `await` before the HTTP
server binds:

```ts
await db.update(scansTable)
  .set({ status: "failed", errorMessage: "Server restarted while scan was in progress", completedAt: sql`(unixepoch())` })
  .where(eq(scansTable.status, "running"));
```

Any scan left in `running` state by a previous server crash is immediately
marked `failed`, preventing stale "running" rows from appearing on the
Dashboard.

---

## DB schema push

After any schema change in `lib/db/src/schema/`, run:

```sh
pnpm --filter @workspace/db run push
```

Then restart the API server workflow.  Failure to do this causes Drizzle
"Failed query" errors because the live SQLite file is missing new columns.

---

## No data is ever deleted

- Findings use `findingStatus: "ignored"` + the `ignoredFindings` table —
  never hard-delete.
- Duplicate resolution (`keep_one`) records `canonicalFindingId` — never
  touches the filesystem.
- Scan cleanup on startup flips `status` to `"failed"` — never drops rows.
- The `DELETE /findings/clear` route is the sole exception (pre-existing;
  tracked in `BACKLOG.md`).
