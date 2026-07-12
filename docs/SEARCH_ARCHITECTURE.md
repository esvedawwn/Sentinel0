# Sentinel Search Architecture

Sentinel's search layer is a fully local, privacy-preserving query engine.
No search queries or file metadata ever leave the device.

---

## Overview

```
User query (natural language or structured)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  NL Interpreter v2  (ai/search.ts)                            │
│                                                               │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Date parser│  │ Size parser  │  │ Entity/person parser  │  │
│  │ (last 7d,  │  │ (>50MB, etc.)│  │ (name casing, NER)   │  │
│  │  this week,│  │              │  │                       │  │
│  │  YYYY-MM)  │  │              │  │                       │  │
│  └────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                               │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Extension  │  │ Category     │  │ Risk / status        │  │
│  │ extractor  │  │ mapper       │  │ extractor            │  │
│  └────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                               │
│  Output: ParsedFilters (typed, explainable)                   │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Search Service  (search/searchService.ts)                    │
│                                                               │
│  1. Translate filters → Drizzle WHERE clauses                 │
│  2. Execute SQL query against local SQLite DB                 │
│  3. Hybrid relevance scoring (BM25-style + recency + size)    │
│  4. Return ranked FindingSearchResult[]                       │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Search UI  (pages/Search.tsx)                                │
│                                                               │
│  - Filter chips with per-filter remove                        │
│  - Confidence badge (high / medium / low)                     │
│  - Relevance pips (●●●●○ style)                               │
│  - Recent search history (searchHistory table)                │
│  - Saved searches (savedSearches table)                       │
└───────────────────────────────────────────────────────────────┘
```

---

## Natural-Language Interpreter (v2)

File: `artifacts/api-server/src/ai/search.ts`

The NL interpreter runs entirely in-process — it is a deterministic rule-based
parser with no LLM calls and no network access.

### Filter types extracted

| Filter | Examples | Parser |
|--------|----------|--------|
| Date range | "last 7 days", "this week", "before 2024-06", "2024-01-01" | `parseDateMention` |
| File size | ">50MB", "between 1MB and 10MB", "smaller than 500KB" | `parseSizeMention` |
| Extension | ".pdf, .docx", "PDF files", "spreadsheets" | `parseExtensionMention` |
| Category | "documents", "images", "code" | `parseCategoryMention` |
| AI category | "invoices", "contracts", "receipts" | `parseAICategoryMention` |
| Entity / person | "files mentioning Alice", "by Bob Smith" | `parseEntityMention` |
| Risk level | "high risk", "low risk" | `parseRiskMention` |
| Finding status | "duplicates", "corrupted", "large files" | `parseFindingTypeMention` |

### Confidence scoring

Each interpretation is scored:
- **high** — unambiguous match (e.g. explicit extension, known category keyword)
- **medium** — likely match (e.g. known person name pattern, familiar phrase)
- **low** — heuristic guess (e.g. unrecognised tokens mapped to name search)

Confidence is surfaced in the UI via a coloured badge so users can see how
certain the system is about its interpretation and correct it if needed.

### Entity / person detection

`parseEntityMention` extracts capitalized name-like tokens from the **original**
(pre-lowercase) query. This preserves casing for accurate DB LIKE queries (e.g.
"Alice" not "alice"). It strips noise words (prepositions, conjunctions) and
limits to 3-word name phrases.

---

## Hybrid Relevance Scoring

File: `artifacts/api-server/src/search/searchService.ts` (scorer section)

After SQL filtering, results are re-ranked with a multi-signal score:

```
relevanceScore = w_name × nameScore
              + w_path × pathScore
              + w_recency × recencyScore
              + w_size × sizeScore
              + w_risk × riskBoost
              + w_ai × aiScore
```

| Signal | Weight | Description |
|--------|--------|-------------|
| Name match | 0.35 | BM25-style term frequency in filename |
| Path match | 0.15 | Terms present in directory path |
| Recency | 0.20 | Files modified within 30/90/365 days score higher |
| Size | 0.10 | Files matching the queried size range get a boost |
| Risk level | 0.10 | High-risk findings score higher |
| AI category | 0.10 | AI classification confidence × match |

Scores are normalised to [0, 1] and converted to relevance pips (1–5) in the UI.

---

## Editable Filters

Users can manually adjust the filters the NL interpreter produced:

- Add or remove extensions (multi-select chip input)
- Change category (dropdown)
- Adjust date range (calendar pickers)
- Change min/max file size (number inputs)
- Remove individual filter chips by clicking ×

Every manual edit updates the `AppliedFilters` state locally and re-fires the
search query (debounced 300ms).

---

## Search History

All completed queries are appended to the `searchHistory` table (max 100 rows,
oldest pruned automatically). History is surfaced in the Search page's sidebar.

Users can also save any search as a named entry in `savedSearches`.

---

## Local-Only Guarantee

`searchService.ts` always uses the local NL interpreter. There is no code path
that routes a search query to a cloud provider:

```typescript
// searchService.ts
const parsed = parseQuery(query);   // local, no network
// ... SQL query against local SQLite ...
```

Enabling/disabling `localOnlyProcessing` in settings has no effect on search —
search is always local regardless.

---

## Performance Notes

- SQLite with WAL mode handles typical home/office file collections (< 1M rows)
  comfortably at query times under 50ms.
- The relevance scorer operates in-memory on the result set returned by SQL.
  For very large result sets (> 10,000 rows), the scorer is the bottleneck —
  consider adding SQL-side pagination before scoring if needed.
- `searchHistory` writes are fire-and-forget (no await in the route handler)
  to avoid adding latency to search responses.
