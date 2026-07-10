# Sentinel — AI Privacy & Data Handling

## Default posture: fully offline

Out of the box, Sentinel's AI layer runs entirely on-device using
`LocalRuleProvider`. No filenames, paths, file contents, or metadata ever
leave the machine unless you explicitly configure a cloud provider.

## What data could a cloud provider see (if enabled)

Cloud providers are **disabled by default** and require an explicit API key
env var (`OPENAI_API_KEY` or `EMBEDDINGS_API_KEY`) to activate. If enabled,
only classification input is sent — never full file contents:

- File name, extension, size, and containing folder path
- The finding type (e.g. `zero_byte`, `duplicate`, `installer`)
- Neighbouring filenames in the same folder (for context, filenames only)

Sentinel never uploads file **contents**, never uploads entire directory
trees, and never performs bulk/background uploads. Classification is
per-finding, on-demand, at scan time only.

## No hardcoded keys

No API key, secret, or credential is bundled, hardcoded, or committed
anywhere in this repository. Cloud providers activate only when the
corresponding environment variable is present in the deployment
environment, managed through Replit's environment/secrets system.

## Natural-language search stays local

`GET /api/ai/search` (`interpretSearchQuery()`) is implemented with local
keyword rules only. Search queries are never sent to a cloud AI provider,
regardless of whether cloud classification is enabled — search and
classification are independent subsystems.

## AI never mutates files

The AI layer has no filesystem write access. Every classification result
carries `requiresConfirmation: true`, and any suggestion whose action would
change the filesystem (`delete`, `archive`) is also marked `safe: false`.
All suggested actions are previews — a human must explicitly confirm before
anything happens, and as of this version no execution path exists yet (see
`docs/AI_ROADMAP.md`).

## Failure behavior

If a configured cloud provider errors, times out, or returns malformed data,
`classifyWithAI()` falls back to `LocalRuleProvider` automatically. A finding
is never left unclassified, and no partial/cloud data is retried silently in
the background.

## Document extraction & OCR

Text extraction (and OCR) is a separate subsystem from AI classification, with its own
consent boundary:

- Extraction runs **only per-file, on-demand** — there is no bulk, background, or
  full-tree extraction/OCR path anywhere in the codebase
- The OCR provider defaults to a local/offline implementation; the cloud OCR path is
  wired but stays inert unless `userSettings.cloudConsent` is explicitly set to `true`
- Extracted text and derived entities are stored in dedicated `extractedText` /
  `entities` tables, separate from `findings` — they are never merged into a finding's
  own row
- Sensitive-content detection (legal/banking/medical/identity/API keys/passwords/private
  keys) and entity extraction (people/orgs/dates/invoice#/case ref/amounts) are both
  local heuristic/regex passes — no data leaves the machine to compute them
- AI summarization over extracted text is opt-in per document ID and requires cloud
  consent, following the same posture as classification above
- Disabling `localOnlyProcessing` in settings requires `cloudConsent: true` first (the
  API returns 409 otherwise) — a user cannot accidentally enable cloud processing

## Findings review & search stay local too

- The findings review workflow (state transitions, bulk actions, audit log, action
  queue) is pure local DB read/write — no network calls, no AI, no filesystem writes
- Accepting a finding only ever creates a proposed `actionQueue` row describing an
  intended move/archive/delete/keep; nothing is executed automatically, and dismissing a
  queued action only deletes the queue row, never touches a file
- Unified search (NL interpretation + saved searches + history) reuses the same local
  keyword interpreter as AI search — no query text is ever sent to a cloud provider

## Summary

| Question | Answer |
|---|---|
| Is cloud AI on by default? | No |
| Are API keys stored in code? | No — env vars only, user-provided |
| Is file content ever sent anywhere? | No — metadata only, and only if cloud enabled |
| Can AI delete or move files? | No — recommendation-only, confirmation required |
| Does search use the cloud? | No — always local keyword rules |
| Is extraction/OCR ever run in bulk or automatically? | No — strictly per-file, on-demand |
| Can accepting a finding delete or move a file? | No — it only queues a proposal; nothing executes automatically |
