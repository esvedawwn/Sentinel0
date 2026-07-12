# Project Intelligence Architecture

Sentinel's Project Intelligence system discovers and proposes logical groupings ("projects") from indexed files. It is entirely local, never touches the filesystem, and never auto-creates projects without explicit user approval.

---

## Overview

After a scan, Sentinel can run a multi-signal grouping algorithm that scores every pair of findings and clusters those that score above a threshold. The resulting groups are saved as **project candidates** — proposals that the user must explicitly approve, reject, or merge before a project is created.

---

## Signal Model

Seven signals contribute to a pair's score, each weighted independently:

| Signal               | Weight | Description |
|----------------------|--------|-------------|
| `folderProximity`    | 0.25   | Common ancestor folder depth ratio |
| `sharedTags`        | 0.18   | Dice overlap of semantic tags |
| `sharedEntities`    | 0.18   | Dice overlap of extracted entities (people, orgs, refs) |
| `filenameSimilarity` | 0.14   | Jaccard overlap of filename tokens (split on `[\s\-_.]`) |
| `sharedAiCategory`  | 0.10   | Both files share the same AI category |
| `semanticSimilarity`| 0.10   | Cosine similarity of embedding vectors (0 when unavailable) |
| `dateProximity`     | 0.05   | File modification timestamps within 30 days |

Final pair score = weighted sum capped at 1.0.

**Cluster threshold:** 0.35. Pairs scoring below this are not connected.

---

## Algorithm

```
1. Load up to 500 findings (capped to keep O(n²) tractable).
2. Augment each finding with its semantic tags, extracted entities, and embedding vector.
3. Build a correction map:
     - Pairs already in an approved project → skip (already organised).
     - Pairs from a rejected candidate → raise effective threshold by +0.15.
4. Score every pair (i, j):
     - Compute the 7-signal PairSignals struct.
     - If score ≥ effective threshold → union-find merge.
5. Collect clusters (groups of ≥ 2 findings).
6. For each cluster:
     - Derive a name from the most common folder segment.
     - Compute an explanation string from dominant signals.
     - Persist a project_candidates row + project_candidate_files rows.
7. Return the new candidates.
```

---

## Database Schema

```
projects
  id, name, description, status (active|archived|deleted),
  confidence, explanation, summary, createdAt, updatedAt

project_files
  id, projectId → projects.id, findingId → findings.id,
  addedBy (auto|user), createdAt

project_candidates
  id, name, projectId (null until approved),
  status (pending|approved|rejected|merged),
  score (0–1), signals (JSON), explanation,
  createdAt, updatedAt

project_candidate_files
  id, candidateId → project_candidates.id,
  findingId → findings.id, contribution (0–1), createdAt
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/candidates/generate` | Run grouping algorithm; create candidate rows |
| `GET`  | `/projects/candidates` | List candidates (filter by status) |
| `POST` | `/projects/candidates/:id/approve` | Approve → create project + link files |
| `POST` | `/projects/candidates/:id/reject` | Reject; pair will need stronger signal to re-appear |
| `POST` | `/projects/candidates/merge` | Merge 2+ candidates into one project |
| `GET`  | `/projects` | List approved projects (active by default) |
| `POST` | `/projects` | Manually create a project |
| `GET`  | `/projects/:id` | Full detail: files, entities, categories, timeline, storage |
| `PATCH`| `/projects/:id` | Update name/description/status/summary |
| `POST` | `/projects/:id/files` | Manually add a finding to a project |
| `DELETE`| `/projects/:id/files/:findingId` | Remove a finding from a project |
| `POST` | `/projects/:id/split` | Move specific findings into a new project |
| `GET`  | `/projects/search?q=` | Search projects by name, description, or linked file names |

---

## Candidate Lifecycle

```
        generate
           │
           ▼
        pending ──────── approve ──────► active project
           │
           ├─────────── reject  ──────► rejected (pairs need +0.15 to re-cluster)
           │
           └─────────── merge   ──────► merged (combined into one active project)
```

---

## Project Detail

`GET /projects/:id` returns:

- **project** — name, description, confidence, explanation, summary
- **files** — all linked findings with AI category, size, modified date
- **people / orgs** — unique entity values from linked findings
- **categories** — unique AI categories across linked files
- **timeline** — findings sorted by `fileModifiedAt`
- **storageTotalBytes** — sum of all linked file sizes

---

## User Workflow

1. Run a scan (or use existing findings).
2. Click **Analyse** on the Projects page — triggers `POST /projects/candidates/generate`.
3. Review candidates: each shows confidence score, signal breakdown, and file count.
4. Per-candidate actions:
   - **Approve** — creates a project; files are linked (not moved).
   - **Reject** — dismissed; pairs need stronger signal to re-cluster.
   - **Merge** (select 2+) — combines multiple candidates into one project.
5. Open a project to see its full detail view: entities, timeline, category breakdown, file list.
6. **Split** — select files within a project and move them to a new project.

---

## Search

`GET /projects/search?q=` performs case-insensitive substring matching across:
- Project name
- Project description
- Project explanation
- Linked file names (via join on `project_files` → `findings`)

Results include `matchContext: "Matched via linked file"` when the match was on a file name rather than project metadata.

---

## Privacy & Safety Guarantees

- **No files are ever moved, renamed, or deleted** by project intelligence.
- All grouping and project data lives entirely in the local SQLite database.
- No file contents are sent to any external service — only path/name/extension/metadata is used.
- `findings.riskLevel` and project confidence scores are display-only heuristics.
- Rejecting a candidate does not delete findings; it only raises the re-cluster threshold.
- Approving a candidate creates `project_files` rows (FK links) — it never modifies findings.
