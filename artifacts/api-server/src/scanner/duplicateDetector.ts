import fs from "fs";
import crypto from "crypto";
import { db, fileHashesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Staged duplicate detection pipeline:
 *   1. group candidates by exact file size (cheapest, biggest filter — a
 *      unique size can never collide with another file)
 *   2. within a size group, split further by extension once the group is
 *      large enough that the split meaningfully reduces hash comparisons
 *   3. only files that survive both stages are ever hashed
 *   4. hashes are content-addressed with SHA-256 and cached by
 *      path+size+mtime so re-scans skip re-reading unchanged files
 *
 * Callers that already have a scan cursor (realScanner.ts) drive
 * cancellation/progress through the options below; this module has no
 * knowledge of the `scans` table.
 */

export interface HashCandidate {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt?: Date;
}

/** Once a same-size group exceeds this many files, split by extension too. */
const EXTENSION_SPLIT_THRESHOLD = 20;

/**
 * Compute a SHA-256 hash of a file's contents via streaming read.
 * Cancellable via AbortSignal — the underlying stream is destroyed and the
 * promise resolves to `null` rather than throwing, so callers can treat
 * "aborted" and "unreadable" the same way (skip this file).
 */
export function computeSha256(filePath: string, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => {
      stream.destroy();
      finish(null);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => finish(hash.digest("hex")));
    stream.on("error", () => finish(null));
  });
}

/** Group candidates by exact byte size, dropping sizes with only one file. */
export function groupBySize<T extends { sizeBytes: number }>(entries: T[]): Map<number, T[]> {
  const bySize = new Map<number, T[]>();
  for (const entry of entries) {
    if (entry.sizeBytes <= 0) continue;
    const arr = bySize.get(entry.sizeBytes);
    if (arr) arr.push(entry);
    else bySize.set(entry.sizeBytes, [entry]);
  }
  for (const [size, arr] of bySize) {
    if (arr.length < 2) bySize.delete(size);
  }
  return bySize;
}

/**
 * Stage 1+2 of the pipeline: size groups, further split by extension when
 * the group is large enough that a split meaningfully cuts the hash count.
 * Returns a flat list of "buckets" — every bucket has >= 2 members and every
 * member in a bucket must be hashed to confirm/deny a duplicate.
 */
export function stageCandidates<T extends { sizeBytes: number; extension: string }>(entries: T[]): T[][] {
  const bySize = groupBySize(entries);
  const buckets: T[][] = [];
  for (const group of bySize.values()) {
    if (group.length <= EXTENSION_SPLIT_THRESHOLD) {
      buckets.push(group);
      continue;
    }
    const byExt = new Map<string, T[]>();
    for (const entry of group) {
      const arr = byExt.get(entry.extension);
      if (arr) arr.push(entry);
      else byExt.set(entry.extension, [entry]);
    }
    for (const sub of byExt.values()) {
      if (sub.length >= 2) buckets.push(sub);
    }
  }
  return buckets;
}

/**
 * Look up a cached hash for a path. Returns null (cache miss) if there is no
 * cached row, or if the file's size/modified time no longer match what was
 * cached — in which case the caller must re-hash.
 */
export async function getCachedHash(path: string, sizeBytes: number, modifiedAt?: Date): Promise<string | null> {
  const [row] = await db.select().from(fileHashesTable).where(eq(fileHashesTable.path, path));
  if (!row) return null;
  if (row.sizeBytes !== sizeBytes) return null;
  if (modifiedAt && row.modifiedAt && row.modifiedAt.getTime() !== modifiedAt.getTime()) return null;
  if (!modifiedAt !== !row.modifiedAt) return null;
  return row.hash;
}

/** Upsert the hash cache row for a path (structural metadata only — never file contents). */
export async function upsertCachedHash(
  path: string,
  sizeBytes: number,
  modifiedAt: Date | undefined,
  hash: string
): Promise<void> {
  await db
    .insert(fileHashesTable)
    .values({ path, sizeBytes, modifiedAt: modifiedAt ?? null, hash, algo: "sha256" })
    .onConflictDoUpdate({
      target: fileHashesTable.path,
      set: { sizeBytes, modifiedAt: modifiedAt ?? null, hash, updatedAt: new Date() },
    });
}

export interface DetectDuplicatesOptions {
  /** Aborts in-flight hashing immediately (stream destroyed mid-read). */
  signal?: AbortSignal;
  /** Polled periodically; returning true stops the pipeline before the next hash. */
  isCancelled?: () => Promise<boolean> | boolean;
  /** How many files to hash between isCancelled() polls. */
  cancelCheckInterval?: number;
  /** Called after every hash attempt (cache hit or miss) with running totals. */
  onProgress?: (hashesComputed: number, hashesTotal: number) => void | Promise<void>;
}

export interface DetectDuplicatesResult {
  /** hash -> all candidates that share it (only hashes with >= 2 members). */
  hashGroups: Map<string, HashCandidate[]>;
  hashesComputed: number;
  hashesTotal: number;
  cancelled: boolean;
}

/**
 * Run the full staged pipeline against a set of candidates and return the
 * resulting duplicate groups. Does not touch the `scans`/`findings` tables —
 * callers are responsible for persisting duplicate groups from the result.
 */
export async function detectDuplicatesStaged(
  entries: HashCandidate[],
  options: DetectDuplicatesOptions = {}
): Promise<DetectDuplicatesResult> {
  const { signal, isCancelled, cancelCheckInterval = 25, onProgress } = options;
  const buckets = stageCandidates(entries);
  const hashesTotal = buckets.reduce((sum, b) => sum + b.length, 0);
  const hashGroups = new Map<string, HashCandidate[]>();

  let hashesComputed = 0;
  let cancelled = false;

  outer: for (const bucket of buckets) {
    const byHash = new Map<string, HashCandidate[]>();

    for (const entry of bucket) {
      if (signal?.aborted) {
        cancelled = true;
        break outer;
      }
      if (isCancelled && hashesComputed % cancelCheckInterval === 0) {
        if (await isCancelled()) {
          cancelled = true;
          break outer;
        }
      }

      let hash = await getCachedHash(entry.path, entry.sizeBytes, entry.modifiedAt);
      if (!hash) {
        hash = await computeSha256(entry.path, signal);
        if (hash) await upsertCachedHash(entry.path, entry.sizeBytes, entry.modifiedAt, hash);
      }

      hashesComputed++;
      if (onProgress) await onProgress(hashesComputed, hashesTotal);

      if (!hash) continue;
      const arr = byHash.get(hash);
      if (arr) arr.push(entry);
      else byHash.set(hash, [entry]);
    }

    for (const [hash, arr] of byHash) {
      if (arr.length < 2) continue;
      const existing = hashGroups.get(hash);
      if (existing) existing.push(...arr);
      else hashGroups.set(hash, arr);
    }
  }

  return { hashGroups, hashesComputed, hashesTotal, cancelled };
}

/** Pick the canonical ("keep this one") candidate: oldest file, tie-broken by path. */
export function pickCanonical(entries: HashCandidate[]): HashCandidate {
  return [...entries].sort((a, b) => {
    const at = a.modifiedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.modifiedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.path.localeCompare(b.path);
  })[0];
}
