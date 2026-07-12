import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import request from "supertest";

let dbDir: string;
let dbPath: string;

beforeAll(() => {
  dbDir = mkdtempSync(path.join(tmpdir(), "sentinel-privacy-test-"));
  dbPath = path.join(dbDir, "test.db");
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

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedScan() {
  const { db, scansTable } = await import("@workspace/db");
  const [scan] = await db
    .insert(scansTable)
    .values({ path: "/tmp/test", mode: "sample", status: "completed", filesScanned: 1, foldersScanned: 0, bytesScanned: 100, filesTotal: 1 })
    .returning();
  return scan;
}

async function seedFinding(scanId: number) {
  const { db, findingsTable } = await import("@workspace/db");
  const [finding] = await db
    .insert(findingsTable)
    .values({ scanId, type: "large_file", path: "/tmp/test/file.bin", name: "file.bin", extension: ".bin", sizeBytes: 100, findingStatus: "review", riskLevel: "medium", reason: "Large file" })
    .returning();
  return finding;
}

// ── GET /settings/index-location ──────────────────────────────────────────────

describe("GET /api/settings/index-location", () => {
  it("returns a path string", async () => {
    const app = (await import("../../app.js")).default;
    const res = await request(app).get("/api/settings/index-location");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("path");
    expect(typeof res.body.path).toBe("string");
    expect(res.body.path.length).toBeGreaterThan(0);
  });

  it("path reflects SENTINEL_DB_PATH env var", async () => {
    const app = (await import("../../app.js")).default;
    const res = await request(app).get("/api/settings/index-location");
    expect(res.status).toBe(200);
    expect(res.body.path).toContain(dbPath);
  });
});

// ── DELETE /settings/index ────────────────────────────────────────────────────

describe("DELETE /api/settings/index", () => {
  it("clears findings, files, and activity rows", async () => {
    const { db, findingsTable, filesTable, activityTable } = await import("@workspace/db");
    const app = (await import("../../app.js")).default;

    const scan = await seedScan();
    await seedFinding(scan.id);
    await db.insert(activityTable).values({ type: "scan_started", message: "test", status: "info" });

    const res = await request(app).delete("/api/settings/index");
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBeInstanceOf(Array);
    expect(res.body.cleared.length).toBeGreaterThan(0);
    expect(res.body.message).toBeTruthy();

    // Verify DB is empty
    const findings = await db.select().from(findingsTable);
    expect(findings.length).toBe(0);

    const files = await db.select().from(filesTable);
    expect(files.length).toBe(0);

    const activity = await db.select().from(activityTable);
    expect(activity.length).toBe(0);
  });

  it("preserves scan roots and user settings after clearing", async () => {
    const { db, scanRootsTable, userSettingsTable } = await import("@workspace/db");
    const app = (await import("../../app.js")).default;

    await db.insert(scanRootsTable).values({ path: "/Users/test/Documents", scanCount: 1 }).onConflictDoNothing();
    await db.insert(userSettingsTable).values({ id: 1 }).onConflictDoNothing();

    await request(app).delete("/api/settings/index");

    const roots = await db.select().from(scanRootsTable);
    const settings = await db.select().from(userSettingsTable);

    expect(roots.length).toBeGreaterThanOrEqual(1);
    expect(settings.length).toBe(1);
  });
});

// ── DELETE /settings/extracted-text ───────────────────────────────────────────

describe("DELETE /api/settings/extracted-text", () => {
  it("returns 200 with cleared table names", async () => {
    const app = (await import("../../app.js")).default;
    const res = await request(app).delete("/api/settings/extracted-text");
    expect(res.status).toBe(200);
    expect(res.body.cleared).toContain("extractedText");
    expect(res.body.cleared).toContain("entities");
    expect(res.body.cleared).toContain("embeddingChunks");
  });

  it("clears extractedText rows when present", async () => {
    const { db, extractedTextTable } = await import("@workspace/db");
    const app = (await import("../../app.js")).default;

    const scan = await seedScan();
    const finding = await seedFinding(scan.id);

    await db.insert(extractedTextTable).values({
      findingId: finding.id,
      extractor: "txt",
      text: "Hello world",
    });

    await request(app).delete("/api/settings/extracted-text");

    const rows = await db.select().from(extractedTextTable);
    expect(rows.length).toBe(0);
  });
});

// ── DELETE /settings/embeddings ───────────────────────────────────────────────

describe("DELETE /api/settings/embeddings", () => {
  it("returns 200 with cleared table names and deletedCount", async () => {
    const app = (await import("../../app.js")).default;
    const res = await request(app).delete("/api/settings/embeddings");
    expect(res.status).toBe(200);
    expect(res.body.cleared).toContain("embeddingChunks");
    expect(typeof res.body.deletedCount).toBe("number");
  });

  it("reports 0 deleted when table is already empty", async () => {
    const { db, embeddingChunksTable } = await import("@workspace/db");
    const app = (await import("../../app.js")).default;

    await db.delete(embeddingChunksTable);
    const res = await request(app).delete("/api/settings/embeddings");
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(0);
  });
});
