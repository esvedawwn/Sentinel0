import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import path from "path";

let dbDir: string;
let filesDir: string;

beforeAll(() => {
  dbDir = mkdtempSync(path.join(tmpdir(), "sentinel-dupdetect-db-"));
  const dbPath = path.join(dbDir, "test.db");
  process.env.SENTINEL_DB_PATH = dbPath;

  const dbPackageDir = path.resolve(__dirname, "../../../../../lib/db");
  execSync("pnpm exec drizzle-kit push --force", {
    cwd: dbPackageDir,
    env: { ...process.env, SENTINEL_DB_PATH: dbPath },
    stdio: "pipe",
  });
});

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true });
});

beforeEach(() => {
  filesDir = mkdtempSync(path.join(tmpdir(), "sentinel-dupdetect-files-"));
});

afterEach(() => {
  rmSync(filesDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string, mtime?: Date) {
  const p = path.join(filesDir, name);
  writeFileSync(p, content);
  if (mtime) utimesSync(p, mtime, mtime);
  return p;
}

async function candidateFor(filePath: string, sizeBytes: number, modifiedAt?: Date) {
  return {
    path: filePath,
    name: path.basename(filePath),
    extension: path.extname(filePath),
    sizeBytes,
    modifiedAt,
  };
}

describe("duplicateDetector staged pipeline", () => {
  it("detects identical files as a duplicate group", async () => {
    const { detectDuplicatesStaged } = await import("../duplicateDetector.js");

    const content = "hello world, this is identical content";
    const a = writeFile("a.txt", content);
    const b = writeFile("b.txt", content);

    const candidates = await Promise.all([
      candidateFor(a, content.length),
      candidateFor(b, content.length),
    ]);

    const result = await detectDuplicatesStaged(candidates);

    expect(result.cancelled).toBe(false);
    expect(result.hashGroups.size).toBe(1);
    const [group] = [...result.hashGroups.values()];
    expect(group.map((f) => f.path).sort()).toEqual([a, b].sort());
  });

  it("does not group files with the same name but different content", async () => {
    const { detectDuplicatesStaged } = await import("../duplicateDetector.js");

    const dirA = path.join(filesDir, "dirA");
    const dirB = path.join(filesDir, "dirB");
    const fs = await import("fs");
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);

    const pathA = path.join(dirA, "same-name.txt");
    const pathB = path.join(dirB, "same-name.txt");
    fs.writeFileSync(pathA, "content one, padded to match length!!");
    fs.writeFileSync(pathB, "content two, padded to match length!!");

    const sizeA = fs.statSync(pathA).size;
    const sizeB = fs.statSync(pathB).size;
    expect(sizeA).toBe(sizeB);

    const candidates = [
      await candidateFor(pathA, sizeA),
      await candidateFor(pathB, sizeB),
    ];

    const result = await detectDuplicatesStaged(candidates);

    expect(result.hashGroups.size).toBe(0);
  });

  it("does not hash (or group) files that merely share a size but differ in content", async () => {
    const { detectDuplicatesStaged, stageCandidates } = await import("../duplicateDetector.js");

    const contentA = "aaaaaaaaaa";
    const contentB = "bbbbbbbbbb";
    const a = writeFile("same-size-a.bin", contentA);
    const b = writeFile("same-size-b.bin", contentB);

    const candidates = [
      await candidateFor(a, contentA.length),
      await candidateFor(b, contentB.length),
    ];

    const buckets = stageCandidates(candidates);
    expect(buckets.length).toBe(1);
    expect(buckets[0].length).toBe(2);

    const result = await detectDuplicatesStaged(candidates);
    expect(result.hashesTotal).toBe(2);
    expect(result.hashGroups.size).toBe(0);
  });

  it("reuses a cached hash when size and mtime are unchanged, skipping re-read", async () => {
    const { detectDuplicatesStaged, upsertCachedHash, computeSha256 } = await import("../duplicateDetector.js");

    const content = "cache-reuse-content";
    const mtime = new Date("2024-01-01T00:00:00Z");
    const a = writeFile("cache-a.txt", content, mtime);
    const b = writeFile("cache-b.txt", content, mtime);

    const realHash = await computeSha256(a);
    expect(realHash).toBeTruthy();

    // Pre-seed the cache for `a` with a bogus hash so we can prove it was
    // reused (not recomputed) — a real cache hit would report the same
    // (bogus) hash, not the true content hash.
    const bogusHash = "0".repeat(64);
    await upsertCachedHash(a, content.length, mtime, bogusHash);

    const candidates = [
      await candidateFor(a, content.length, mtime),
      await candidateFor(b, content.length, mtime),
    ];

    const result = await detectDuplicatesStaged(candidates);

    // Since `a`'s cached hash is bogus and doesn't match `b`'s real hash,
    // they must NOT be grouped together — proving the cached value was used
    // instead of a fresh read (which would have matched).
    expect(result.hashGroups.size).toBe(0);
  });

  it("invalidates the cache when a file's mtime changes", async () => {
    const { getCachedHash, upsertCachedHash } = await import("../duplicateDetector.js");

    const content = "mtime-invalidation-content";
    const mtimeOld = new Date("2024-01-01T00:00:00Z");
    const mtimeNew = new Date("2024-06-01T00:00:00Z");
    const a = writeFile("mtime.txt", content, mtimeOld);

    await upsertCachedHash(a, content.length, mtimeOld, "a".repeat(64));

    const staleHit = await getCachedHash(a, content.length, mtimeOld);
    expect(staleHit).toBe("a".repeat(64));

    const miss = await getCachedHash(a, content.length, mtimeNew);
    expect(miss).toBeNull();
  });

  it("stops hashing when cancelled mid-pipeline and reports cancelled=true", async () => {
    const { detectDuplicatesStaged } = await import("../duplicateDetector.js");

    const content = "cancel-me";
    const files = Array.from({ length: 6 }, (_, i) => writeFile(`cancel-${i}.txt`, content));
    const candidates = await Promise.all(files.map((f) => candidateFor(f, content.length)));

    let calls = 0;
    const result = await detectDuplicatesStaged(candidates, {
      cancelCheckInterval: 1,
      isCancelled: async () => {
        calls++;
        return calls > 2;
      },
    });

    expect(result.cancelled).toBe(true);
    expect(result.hashesComputed).toBeLessThan(candidates.length);
  });

  it("aborts an in-flight hash read via AbortSignal", async () => {
    const { computeSha256 } = await import("../duplicateDetector.js");
    const content = "abort-content";
    const a = writeFile("abort.txt", content);

    const controller = new AbortController();
    controller.abort();
    const hash = await computeSha256(a, controller.signal);
    expect(hash).toBeNull();
  });

  it("picks the oldest file as canonical, tie-broken by path", async () => {
    const { pickCanonical } = await import("../duplicateDetector.js");

    const older = { path: "/z/old.txt", name: "old.txt", extension: ".txt", sizeBytes: 10, modifiedAt: new Date("2020-01-01") };
    const newer = { path: "/a/new.txt", name: "new.txt", extension: ".txt", sizeBytes: 10, modifiedAt: new Date("2024-01-01") };
    expect(pickCanonical([newer, older]).path).toBe(older.path);

    const tieA = { path: "/a/tie.txt", name: "tie.txt", extension: ".txt", sizeBytes: 10, modifiedAt: new Date("2020-01-01") };
    const tieB = { path: "/b/tie.txt", name: "tie.txt", extension: ".txt", sizeBytes: 10, modifiedAt: new Date("2020-01-01") };
    expect(pickCanonical([tieB, tieA]).path).toBe(tieA.path);
  });
});
