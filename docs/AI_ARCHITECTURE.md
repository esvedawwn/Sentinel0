# Sentinel — AI Architecture

## Overview

The AI intelligence layer lives entirely inside the API server at
`artifacts/api-server/src/ai/`. It is a pluggable classification and search
system that annotates scan findings with a category, an explanation, and a
suggested (non-executed) next step. It is independent of the scanner engine —
the scanner calls into it, not the other way around.

```
artifacts/api-server/src/ai/
├── types.ts            — AIClassificationInput, AIClassificationResult,
│                         AIRecommendation, AICategory (24 values), AIStatus
├── classifier.ts        — Provider factory + classifyWithAI() entry point
├── search.ts            — interpretSearchQuery() — local NL search rules
├── status.ts             — getAIStatus() — reports local/cloud/offline state
├── index.ts              — barrel exports
└── providers/
    ├── localRule.ts      — offline rule-based classifier (always available)
    ├── openai.ts         — OpenAI-compatible provider stub (kind: "cloud")
    └── embeddings.ts     — semantic embeddings provider stub (kind: "cloud")
```

## Provider Abstraction

Every provider implements the same `AIProvider` interface:

```ts
interface AIProvider {
  kind: "local" | "cloud";
  classify(input: AIClassificationInput): Promise<AIClassificationResult>;
}
```

`classifyWithAI()` selects a provider by priority and always falls back to
`LocalRuleProvider` on any error, timeout, or missing credential:

1. **EmbeddingsProvider** (`kind: "cloud"`) — used only if `EMBEDDINGS_API_KEY` is set
2. **OpenAIProvider** (`kind: "cloud"`) — used only if `OPENAI_API_KEY` is set
3. **LocalRuleProvider** (`kind: "local"`) — always available, zero network I/O

Override with `AI_PROVIDER=local|openai|embeddings`. **Cloud providers are
disabled by default** — no key is bundled or hardcoded anywhere in the repo;
without an explicit env var, Sentinel runs 100% offline.

## Categories (24 total)

Legal · Banking · Tax · Receipts · Invoices · Design · Branding ·
Web Development · Photography · Video · Audio · Renovation · Property ·
Medical · Personal Documents · Identity Documents · Business · Software ·
Installers · Archives · Screenshots · Temporary Files · Lock Files ·
Duplicate Candidates · Unknown

Each classification result may also include a free-text **subcategory**
(e.g. "RAW original" under Photography, "Adobe InDesign lock" under Lock
Files) for finer-grained context beyond the fixed category list.

## Classification Result Shape

```ts
interface AIClassificationResult {
  category: AICategory;
  subcategory?: string;
  confidence: number;        // 0–100
  explanation: string;       // human-readable, one sentence
  tags: string[];
  suggestedDestination?: string;  // e.g. "Documents/Invoices"
  suggestedAction?: string;       // human-readable, advisory only
  recommendation: AIRecommendation;
  provider: string;          // e.g. "local-rule"
}

interface AIRecommendation {
  action: "delete" | "review" | "archive" | "keep" | "ignore";
  reason: string;
  safe: boolean;              // true only for zero-risk suggestions
  reversible: boolean;
  requiresConfirmation: true; // always true — no exceptions
}
```

## Local Rule Engine

`LocalRuleProvider` classifies using, in priority order: finding type (e.g.
`zero_byte`, `installer`, `duplicate`) → filename/path keyword matches →
extension → file size heuristics. It is deterministic, has no network
dependency, and runs in constant time per file. See
`artifacts/api-server/src/ai/providers/localRule.ts` and its test suite in
`src/ai/__tests__/localRule.test.ts` for the exact rule table.

## Natural-Language Search

`GET /api/ai/search?q=...` (backed by `interpretSearchQuery()`) parses a
free-text query into structured filters — categories, statuses, and a
minimum size — using local keyword rules only (e.g. "large duplicate
photos" → categories `Photography`+`Duplicate Candidates`, status
`duplicate`, `minSizeBytes` ≈ 100MB). No text is ever sent to a cloud
service for search interpretation; this always runs locally regardless of
whether a cloud AI provider is configured for classification.

## AI Status Reporting

`GET /api/ai/status` (backed by `getAIStatus()`) reports the currently active
provider mode so the UI can show an honest badge:

```ts
type AIStatus = "local" | "cloud" | "offline";
```

- `"local"` — LocalRuleProvider is active (default state, no keys configured)
- `"cloud"` — a cloud provider is configured and reachable
- `"offline"` — a cloud provider is configured but currently unreachable
  (falls back to local automatically; status reflects the degraded state)

## Data Flow

```
Scanner finds a file/folder/duplicate
        │
        ▼
classifyWithAI(input) — provider selected per rules above
        │
        ▼
AIClassificationResult persisted onto the finding row
  (ai_category, ai_subcategory, ai_confidence, ai_explanation,
   ai_tags, ai_suggested_destination, ai_suggested_action, ai_provider)
        │
        ▼
GET /api/findings exposes all AI fields to the frontend
        │
        ▼
Findings.tsx renders category badge, subcategory, confidence bar,
explanation, tags, suggested destination/action — all read-only
```

## Safety Contract

> The AI layer only classifies and suggests. It never touches the
> filesystem. Every `AIRecommendation` has `requiresConfirmation: true`
> unconditionally, and destructive actions (`delete`, `archive`) are
> additionally marked `safe: false`. No AI-driven code path calls a file
> mutation function — that boundary is enforced by the scanner remaining
> the only filesystem writer in the codebase, and the scanner is read-only.

See `docs/AI_PRIVACY.md` for the data-handling policy and
`docs/AI_ROADMAP.md` for planned cloud provider work.
