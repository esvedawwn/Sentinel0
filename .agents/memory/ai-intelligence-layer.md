---
name: AI Intelligence Layer
description: Architecture and integration points for the AI file classification system in Sentinel.
---

## Structure

`artifacts/api-server/src/ai/`
- `types.ts` — AIClassificationInput, AIClassificationResult, AIRecommendation, AIProvider interfaces
- `classifier.ts` — `classifyWithAI()` entry point; auto-selects provider; falls back to local-rule on any error
- `index.ts` — barrel exports
- `providers/localRule.ts` — offline, deterministic; covers 11 categories; always available
- `providers/openai.ts` — stub; requires OPENAI_API_KEY
- `providers/embeddings.ts` — stub; requires EMBEDDINGS_API_KEY

## Provider selection priority
1. EmbeddingsProvider (if EMBEDDINGS_API_KEY set)
2. OpenAIProvider (if OPENAI_API_KEY set)
3. LocalRuleProvider (always)

Override: `AI_PROVIDER=local|openai|embeddings`

## DB storage
findings table has 5 AI columns: `ai_category`, `ai_confidence` (0–100 int), `ai_explanation`, `ai_tags` (JSON text[]), `ai_provider`.

## Scanner integration
`realScanner.ts` calls `classifyWithAI()` for every finding (file, empty folder, duplicate) and persists the result alongside the finding row. No AI in simulateScanner.ts (it writes to filesTable, not findingsTable).

## Safety contract
AI may only RECOMMEND actions. `AIRecommendation.safe = false` for any destructive action. No file mutations ever. All suggestions require explicit user confirmation before execution.

**Why:** Core product promise — Sentinel never silently modifies files. AI layer must uphold the same read-only guarantee as the scanner.
