---
name: AI Intelligence Layer
description: Architecture and integration points for the AI file classification system in Sentinel.
---

## Structure

`artifacts/api-server/src/ai/`
- `types.ts` — AIClassificationInput, AIClassificationResult, AIRecommendation, AIProvider interfaces
- `classifier.ts` — `classifyWithAI()` entry point; auto-selects provider; falls back to local-rule on any error
- `index.ts` — barrel exports
- `providers/localRule.ts` — offline, deterministic; covers 24 categories (expanded from 11); always available; exports `classifyLocalRule` for unit testing
- `providers/openai.ts` — stub; requires OPENAI_API_KEY
- `providers/embeddings.ts` — stub; requires EMBEDDINGS_API_KEY
- `search.ts` — `interpretSearchQuery()`, pure local keyword-based NL search parser (never calls cloud, independent of classification provider)
- `status.ts` — `getAIStatus()` reports `"local" | "cloud" | "offline"` for UI badges

## Provider selection priority
1. EmbeddingsProvider (if EMBEDDINGS_API_KEY set)
2. OpenAIProvider (if OPENAI_API_KEY set)
3. LocalRuleProvider (always)

Override: `AI_PROVIDER=local|openai|embeddings`

`AIProvider` interface carries `kind: "local" | "cloud"` so callers can distinguish without probing env vars directly.

## DB storage
findings table has 8 AI columns: `ai_category`, `ai_subcategory`, `ai_confidence` (0–100 int), `ai_explanation`, `ai_tags` (JSON text[]), `ai_suggested_destination`, `ai_suggested_action`, `ai_provider`.

## Testing
Unit tests live in `artifacts/api-server/src/ai/__tests__/` (vitest, added as api-server devDependency, `pnpm --filter @workspace/api-server run test`). Cover local rule classification safety invariants and search interpretation — no DB/network needed since both are pure functions.

## Docs
Dedicated AI docs split out from the general docs: `docs/AI_ARCHITECTURE.md`, `docs/AI_PRIVACY.md`, `docs/AI_ROADMAP.md`. General `docs/ARCHITECTURE.md`/`ROADMAP.md` link to these rather than duplicating detail.

## Scanner integration
`realScanner.ts` calls `classifyWithAI()` for every finding (file, empty folder, duplicate) and persists the result alongside the finding row. No AI in simulateScanner.ts (it writes to filesTable, not findingsTable).

## Safety contract
AI may only RECOMMEND actions. `AIRecommendation.safe = false` for any destructive action. No file mutations ever. All suggestions require explicit user confirmation before execution.

**Why:** Core product promise — Sentinel never silently modifies files. AI layer must uphold the same read-only guarantee as the scanner.
