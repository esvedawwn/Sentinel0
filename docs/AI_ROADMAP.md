# Sentinel — AI Roadmap

## Shipped

- [x] `AIProvider` interface with `kind: "local" | "cloud"`
- [x] `LocalRuleProvider` — 24-category offline rule engine
- [x] `OpenAIProvider` / `EmbeddingsProvider` — typed stubs, disabled without keys
- [x] `classifyWithAI()` orchestrator with automatic fallback to local
- [x] Subcategory, suggested destination, and suggested action fields
- [x] `AICategory` expanded from 11 → 24 categories
- [x] `GET /api/ai/status` — reports local/cloud/offline state
- [x] `GET /api/ai/search` — local natural-language search interpretation
- [x] Findings UI: category, subcategory, confidence, explanation, tags,
      suggested destination/action, and a "preview-only" safety notice
- [x] Unit tests for local classification and search interpretation

## Next

- [ ] Wire real `OpenAIProvider` implementation — parse structured JSON via
      an OpenAI-compatible chat completion, validate with Zod, require
      `OPENAI_API_KEY`
- [ ] Wire real `EmbeddingsProvider` — embed filename+path, compare cosine
      similarity against reference category vectors, require
      `EMBEDDINGS_API_KEY`
- [ ] Surface `GET /api/ai/status` in the UI as a persistent badge
      (Local / Cloud / Offline) rather than only in scan/test tooling
- [ ] Wire `GET /api/ai/search` into the Findings search box as an
      opt-in "smart search" mode, layered on top of (not replacing) the
      existing plain-text search
- [ ] Per-category confidence threshold tuning
- [ ] "Correct Category" user feedback loop — persist corrections for
      future local-rule tuning
- [ ] Bulk re-classify existing findings without a full re-scan

## Explicitly out of scope for now

- Automatic execution of AI suggestions (move/delete/archive) — always
  requires an explicit user-confirmed action, tracked separately in
  `docs/BACKLOG.md` under Findings Actions
- Any background/bulk upload of file contents to a cloud provider
- Any provider selection that silently changes without an explicit env var
