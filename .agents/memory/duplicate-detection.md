---
name: Staged duplicate detection
description: Design pattern for size→extension→hash staged duplicate scanning with a cache, used for large filesystem scans where full-content hashing of every file is too slow.
---

## Pattern

Don't hash every file to find duplicates. Stage the filter so hashing (the expensive
step) only runs on files that already share every free signal:

1. Group by exact file size first (zero IO, eliminates most files immediately).
2. Within a size group large enough to matter, split further by extension before hashing.
3. Only hash what's left, and use a cryptographic hash (not MD5) so grouping can be
   reported with confidence 1.0 instead of "probably".

**Why:** hashing is O(file size) IO+CPU per file; on a large tree the naive "hash
everything" approach dominates scan time and doesn't parallelize well with progress
reporting/cancellation. Staging cuts the hash set by orders of magnitude in practice.

## Hash cache

Cache hashes keyed by absolute path, and only trust the cache when the file's current
size and mtime still match what was cached at hash time. Any mismatch means the file
changed since — treat it as a cache miss, not a stale duplicate.

**Why:** re-scans of a mostly-unchanged tree would otherwise re-hash everything again;
size+mtime is a cheap, good-enough proxy for "this file's content is unchanged" without
needing a filesystem change-notification mechanism.

## Never-auto-delete convention

Resolving a duplicate group should only ever record which member is the "canonical"
copy to keep (plus an estimated savings number) — never delete or move a file as a side
effect of a "resolve"/"keep one" action.

**How to apply:** any destructive cleanup (actually deleting the non-canonical copies)
must be a separate, explicitly-confirmed action with its own preview step — do not fold
it into the same endpoint/button that records the user's grouping decision.
