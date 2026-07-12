---
name: Project candidate scoring threshold
description: Why project candidate tests must seed semantic tags alongside folder proximity and AI category signals.
---

## Rule

`CANDIDATE_THRESHOLD = 0.35`. Folder proximity alone (even for files in the same directory) is not enough to generate a candidate:

- `folderProximity` for same-directory files: segments include the filename, so `/acme/finance/a.xlsx` vs `/acme/finance/b.xlsx` → score = 2/3 ≈ 0.67 → weighted: 0.67 × 0.25 = **0.167**
- `sharedAiCategory` (both same): 1.0 × 0.10 = **0.10**
- Total without tags: **0.267 < 0.35** → no candidate generated

To cross the threshold, tests must also seed shared `semanticTags` for findings:
- `sharedTags` with perfect overlap (all files share same tags): 1.0 × 0.18 = **0.18**
- Combined: 0.167 + 0.10 + 0.18 = **0.447 > 0.35** ✓

**Why:** The scoring formula intentionally requires multiple corroborating signals to avoid false positives. A single signal (folder proximity) isn't enough.

**How to apply:** Any test for `generateCandidates` that expects `generated > 0` must seed at least one shared semantic tag per finding cluster. Use `db.insert(semanticTagsTable).values({ findingId, tag })`.
