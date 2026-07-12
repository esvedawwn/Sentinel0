---
name: NL interpreter entity casing
description: Entity-mention extraction must use the original query string, not the lowercased one.
---

## Rule
Call `parseEntityMention(query.trim())` — the raw, unmodified input — not the `q` variable that has already been lowercased for keyword matching.

## Why
`interpretSearchQuery` does `const q = query.toLowerCase().trim()` immediately on entry to make all keyword comparisons case-insensitive. If `parseEntityMention(q)` is called instead of `parseEntityMention(query.trim())`, every extracted entity comes back lowercased ("kennards" instead of "Kennards"), which breaks downstream entity-subquery lookups and user-visible display.

## How to apply
Any future pattern that extracts a verbatim user-supplied token (person name, org name, file path fragment) from the NL query must operate on `query.trim()`, not `q`.
