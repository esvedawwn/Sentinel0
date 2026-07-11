/**
 * Project intelligence service — proposes candidate groups; never
 * auto-creates or auto-reorganises files.
 *
 * SIGNALS (each 0–1, weighted average → final score):
 *  - folderProximity   (0.30) — files share a common ancestor folder
 *  - sharedTags        (0.20) — overlapping semantic tags
 *  - sharedEntities    (0.20) — overlapping extracted entities (people, orgs, refs)
 *  - filenameSimilarity(0.15) — Jaccard overlap of filename tokens
 *  - sharedAiCategory  (0.10) — same AI category
 *  - dateProximity     (0.05) — file-modified timestamps within 30 days of each other
 *
 * ALGORITHM:
 *  1. Score every pair of findings (O(n²), capped at 500 findings per call).
 *  2. Group pairs with score ≥ threshold using single-linkage clustering.
 *  3. Score each cluster by the mean pairwise score of its members.
 *  4. Persist candidate + candidate_files rows.
 *  5. Return the new candidates.
 *
 * Users then review candidates and either approve, reject, or merge them.
 * Nothing reaches the filesystem — this is purely metadata grouping.
 */

import { eq, and, inArray, sql, ne } from "drizzle-orm";
import {
  db,
  findingsTable,
  semanticTagsTable,
  entitiesTable,
  projectCandidatesTable,
  projectCandidateFilesTable,
  projectsTable,
  projectFilesTable,
  type Finding,
  type ProjectCandidate,
  type Project,
  type ProjectFile,
  type InsertProject,
} from "@workspace/db";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface PairSignals {
  folderProximity: number;
  sharedTags: number;
  sharedEntities: number;
  filenameSimilarity: number;
  sharedAiCategory: number;
  dateProximity: number;
}

const WEIGHTS: Record<keyof PairSignals, number> = {
  folderProximity: 0.30,
  sharedTags: 0.20,
  sharedEntities: 0.20,
  filenameSimilarity: 0.15,
  sharedAiCategory: 0.10,
  dateProximity: 0.05,
};

export const CANDIDATE_THRESHOLD = 0.35;

export interface CandidateWithFiles {
  candidate: ProjectCandidate;
  findingIds: number[];
}

export interface ProjectDetail {
  project: Project;
  files: Finding[];
  people: string[];
  orgs: string[];
  categories: string[];
  timeline: Array<{ findingId: number; name: string; date: Date | null }>;
  storageTotalBytes: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Scoring helpers
// ────────────────────────────────────────────────────────────────────────────

function folderDepth(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function commonPrefixLength(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function computeFolderProximity(pathA: string, pathB: string): number {
  const a = folderDepth(pathA);
  const b = folderDepth(pathB);
  if (a.length === 0 || b.length === 0) return 0;
  const common = commonPrefixLength(a, b);
  // Score by how large a fraction of the shorter path is shared
  return common / Math.min(a.length, b.length);
}

function tokenizeFilename(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, "") // strip extension
      .split(/[\s\-_.]+/)
      .filter((t) => t.length >= 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function dateProximityScore(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  const diffDays = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) return 1;
  if (diffDays <= 7) return 0.8;
  if (diffDays <= 30) return 0.5;
  if (diffDays <= 90) return 0.2;
  return 0;
}

function computeScore(signals: PairSignals): number {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    score += signals[key as keyof PairSignals] * weight;
  }
  return Math.min(score, 1);
}

// ────────────────────────────────────────────────────────────────────────────
// Pair scoring
// ────────────────────────────────────────────────────────────────────────────

interface FindingAugmented extends Finding {
  tags: string[];
  entityValues: string[];
}

async function augmentFindings(findings: Finding[]): Promise<FindingAugmented[]> {
  const ids = findings.map((f) => f.id);
  if (ids.length === 0) return [];

  const [tagRows, entityRows] = await Promise.all([
    db.select().from(semanticTagsTable).where(inArray(semanticTagsTable.findingId, ids)),
    db.select().from(entitiesTable).where(inArray(entitiesTable.findingId, ids)),
  ]);

  const tagsByFinding = new Map<number, string[]>();
  for (const row of tagRows) {
    const list = tagsByFinding.get(row.findingId) ?? [];
    list.push(row.tag.toLowerCase());
    tagsByFinding.set(row.findingId, list);
  }

  const entitiesByFinding = new Map<number, string[]>();
  for (const row of entityRows) {
    const list = entitiesByFinding.get(row.findingId) ?? [];
    list.push(row.value.toLowerCase());
    entitiesByFinding.set(row.findingId, list);
  }

  return findings.map((f) => ({
    ...f,
    tags: tagsByFinding.get(f.id) ?? [],
    entityValues: entitiesByFinding.get(f.id) ?? [],
  }));
}

function pairSignals(a: FindingAugmented, b: FindingAugmented): PairSignals {
  const aTags = new Set(a.tags);
  const bTags = new Set(b.tags);
  const aEntities = new Set(a.entityValues);
  const bEntities = new Set(b.entityValues);

  const sharedTags =
    aTags.size + bTags.size > 0
      ? ([...aTags].filter((t) => bTags.has(t)).length * 2) / (aTags.size + bTags.size)
      : 0;

  const sharedEntities =
    aEntities.size + bEntities.size > 0
      ? ([...aEntities].filter((e) => bEntities.has(e)).length * 2) / (aEntities.size + bEntities.size)
      : 0;

  return {
    folderProximity: computeFolderProximity(a.path, b.path),
    sharedTags,
    sharedEntities,
    filenameSimilarity: jaccardSimilarity(tokenizeFilename(a.name), tokenizeFilename(b.name)),
    sharedAiCategory: a.aiCategory && b.aiCategory && a.aiCategory === b.aiCategory ? 1 : 0,
    dateProximity: dateProximityScore(a.fileModifiedAt, b.fileModifiedAt),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Greedy single-linkage clustering
// ────────────────────────────────────────────────────────────────────────────

function cluster(
  findings: FindingAugmented[],
  threshold = CANDIDATE_THRESHOLD
): Array<{ ids: number[]; signals: PairSignals; score: number }> {
  const n = findings.length;
  const parent: number[] = Array.from({ length: n }, (_, i) => i);
  const signalSums: PairSignals[] = Array.from({ length: n }, () => ({
    folderProximity: 0, sharedTags: 0, sharedEntities: 0,
    filenameSimilarity: 0, sharedAiCategory: 0, dateProximity: 0,
  }));
  const pairCounts: number[] = new Array(n).fill(0);

  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function union(i: number, j: number): void {
    parent[find(i)] = find(j);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const signals = pairSignals(findings[i], findings[j]);
      const score = computeScore(signals);
      if (score >= threshold) {
        union(i, j);
        const root = find(i);
        for (const key of Object.keys(signals) as Array<keyof PairSignals>) {
          signalSums[root][key] += signals[key];
        }
        pairCounts[root]++;
      }
    }
  }

  // Group by root
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .map((group) => {
      const root = find(group[0]);
      const pairs = pairCounts[root] || 1;
      const avgSignals: PairSignals = {
        folderProximity: signalSums[root].folderProximity / pairs,
        sharedTags: signalSums[root].sharedTags / pairs,
        sharedEntities: signalSums[root].sharedEntities / pairs,
        filenameSimilarity: signalSums[root].filenameSimilarity / pairs,
        sharedAiCategory: signalSums[root].sharedAiCategory / pairs,
        dateProximity: signalSums[root].dateProximity / pairs,
      };
      return {
        ids: group.map((i) => findings[i].id),
        signals: avgSignals,
        score: computeScore(avgSignals),
      };
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Name generation for candidates
// ────────────────────────────────────────────────────────────────────────────

function signalExplanation(signals: PairSignals): string {
  const parts: string[] = [];
  if (signals.folderProximity >= 0.5) parts.push("files share a common folder");
  if (signals.sharedTags >= 0.3) parts.push("overlapping semantic tags");
  if (signals.sharedEntities >= 0.3) parts.push("shared extracted entities");
  if (signals.filenameSimilarity >= 0.3) parts.push("similar filenames");
  if (signals.sharedAiCategory >= 0.5) parts.push("same AI category");
  if (signals.dateProximity >= 0.5) parts.push("close modification dates");
  if (parts.length === 0) return "Weak multi-signal match";
  return parts[0][0].toUpperCase() + parts[0].slice(1) + (parts.length > 1 ? ` and ${parts.length - 1} other signal${parts.length > 2 ? "s" : ""}` : "");
}

function deriveName(findings: FindingAugmented[]): string {
  // Find the most common folder segment across the findings
  const segments = findings
    .flatMap((f) => folderDepth(f.path).slice(0, -1)) // exclude filename
    .reduce<Map<string, number>>((acc, seg) => {
      acc.set(seg, (acc.get(seg) ?? 0) + 1);
      return acc;
    }, new Map());

  if (segments.size > 0) {
    const top = [...segments.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (top && top !== "." && top !== "/") {
      return `Project: ${top}`;
    }
  }

  // Fall back to first finding's name stem
  const stem = findings[0]?.name.replace(/\.[^.]+$/, "") ?? "Unnamed";
  return `Project: ${stem} (${findings.length} files)`;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate project candidates from findings in the DB. Caps at 500 findings
 * to keep O(n²) pair scoring in a reasonable time budget.
 */
export async function generateCandidates(opts: {
  scanId?: number;
  limit?: number;
}): Promise<CandidateWithFiles[]> {
  const cap = Math.min(opts.limit ?? 500, 500);
  const baseQuery = db.select().from(findingsTable).limit(cap);

  const rawFindings = opts.scanId
    ? await db.select().from(findingsTable).where(eq(findingsTable.scanId, opts.scanId)).limit(cap)
    : await baseQuery;

  const findings = await augmentFindings(rawFindings);
  const clusters = cluster(findings);

  const created: CandidateWithFiles[] = [];

  for (const { ids, signals, score } of clusters) {
    const clusterFindings = ids.map((id) => findings.find((f) => f.id === id)!).filter(Boolean);
    const name = deriveName(clusterFindings);
    const explanation = signalExplanation(signals);

    const [candidate] = await db
      .insert(projectCandidatesTable)
      .values({
        name,
        score,
        signals: signals as unknown as Record<string, number>,
        explanation,
      })
      .returning();

    await db.insert(projectCandidateFilesTable).values(
      ids.map((findingId) => ({
        candidateId: candidate.id,
        findingId,
        contribution: score,
      }))
    );

    created.push({ candidate, findingIds: ids });
  }

  return created;
}

/**
 * Approve a candidate: create a Project, link its files, mark candidate approved.
 */
export async function approveCandidate(candidateId: number): Promise<Project> {
  const candidate = await db
    .select()
    .from(projectCandidatesTable)
    .where(eq(projectCandidatesTable.id, candidateId))
    .limit(1)
    .then((r) => r[0]);

  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  if (candidate.status !== "pending") throw new Error(`Candidate ${candidateId} is already ${candidate.status}`);

  const candidateFiles = await db
    .select()
    .from(projectCandidateFilesTable)
    .where(eq(projectCandidateFilesTable.candidateId, candidateId));

  const [project] = await db
    .insert(projectsTable)
    .values({
      name: candidate.name,
      confidence: candidate.score,
      explanation: candidate.explanation,
    })
    .returning();

  await db.insert(projectFilesTable).values(
    candidateFiles.map((cf) => ({
      projectId: project.id,
      findingId: cf.findingId,
      addedBy: "auto",
    }))
  );

  await db
    .update(projectCandidatesTable)
    .set({ status: "approved", projectId: project.id, updatedAt: new Date() })
    .where(eq(projectCandidatesTable.id, candidateId));

  return project;
}

/**
 * Merge two or more candidates into one project.
 */
export async function mergeCandidates(candidateIds: number[]): Promise<Project> {
  if (candidateIds.length < 2) throw new Error("Provide at least 2 candidate IDs to merge");

  const candidates = await db
    .select()
    .from(projectCandidatesTable)
    .where(inArray(projectCandidatesTable.id, candidateIds));

  if (candidates.length !== candidateIds.length) {
    throw new Error("One or more candidate IDs not found");
  }

  const allFiles = await db
    .select()
    .from(projectCandidateFilesTable)
    .where(inArray(projectCandidateFilesTable.candidateId, candidateIds));

  const uniqueFindingIds = [...new Set(allFiles.map((f) => f.findingId))];
  const avgScore = candidates.reduce((s, c) => s + c.score, 0) / candidates.length;

  const [project] = await db
    .insert(projectsTable)
    .values({
      name: candidates[0].name,
      confidence: avgScore,
      explanation: `Merged from ${candidates.length} candidates.`,
    })
    .returning();

  await db.insert(projectFilesTable).values(
    uniqueFindingIds.map((findingId) => ({
      projectId: project.id,
      findingId,
      addedBy: "auto",
    }))
  );

  await db
    .update(projectCandidatesTable)
    .set({ status: "merged", projectId: project.id, updatedAt: new Date() })
    .where(inArray(projectCandidatesTable.id, candidateIds));

  return project;
}

/**
 * Split a project: pull out specific findingIds into a new project.
 */
export async function splitProject(
  projectId: number,
  findingIds: number[],
  newName: string
): Promise<Project> {
  const original = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1)
    .then((r) => r[0]);

  if (!original) throw new Error(`Project ${projectId} not found`);
  if (findingIds.length === 0) throw new Error("No finding IDs provided for split");

  // Remove from original
  await db
    .delete(projectFilesTable)
    .where(
      and(
        eq(projectFilesTable.projectId, projectId),
        inArray(projectFilesTable.findingId, findingIds)
      )
    );

  // Create new project with the split files
  const [newProject] = await db
    .insert(projectsTable)
    .values({
      name: newName,
      confidence: original.confidence,
      explanation: `Split from project "${original.name}"`,
    })
    .returning();

  await db.insert(projectFilesTable).values(
    findingIds.map((findingId) => ({
      projectId: newProject.id,
      findingId,
      addedBy: "user",
    }))
  );

  return newProject;
}

/**
 * Get full project detail: findings, people, orgs, timeline, storage.
 */
export async function getProjectDetail(projectId: number): Promise<ProjectDetail> {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1)
    .then((r) => r[0]);

  if (!project) throw new Error(`Project ${projectId} not found`);

  const fileLinks = await db
    .select()
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  const findingIds = fileLinks.map((f) => f.findingId);
  const files =
    findingIds.length > 0
      ? await db.select().from(findingsTable).where(inArray(findingsTable.id, findingIds))
      : [];

  let people: string[] = [];
  let orgs: string[] = [];

  if (findingIds.length > 0) {
    const entities = await db
      .select()
      .from(entitiesTable)
      .where(inArray(entitiesTable.findingId, findingIds));

    people = [
      ...new Set(
        entities
          .filter((e) => e.type === "person")
          .map((e) => e.value)
          .filter(Boolean)
      ),
    ];
    orgs = [
      ...new Set(
        entities
          .filter((e) => e.type === "organization")
          .map((e) => e.value)
          .filter(Boolean)
      ),
    ];
  }

  const categories = [...new Set(files.map((f) => f.aiCategory).filter(Boolean))] as string[];

  const timeline = files
    .map((f) => ({ findingId: f.id, name: f.name, date: f.fileModifiedAt }))
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });

  const storageTotalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);

  return { project, files, people, orgs, categories, timeline, storageTotalBytes };
}

/**
 * List all pending candidates.
 */
export async function listCandidates(status?: string): Promise<CandidateWithFiles[]> {
  const rows = status
    ? await db
        .select()
        .from(projectCandidatesTable)
        .where(eq(projectCandidatesTable.status, status as "pending" | "approved" | "rejected" | "merged"))
    : await db.select().from(projectCandidatesTable);

  const result: CandidateWithFiles[] = [];
  for (const candidate of rows) {
    const fileLinks = await db
      .select()
      .from(projectCandidateFilesTable)
      .where(eq(projectCandidateFilesTable.candidateId, candidate.id));
    result.push({ candidate, findingIds: fileLinks.map((f) => f.findingId) });
  }
  return result;
}
