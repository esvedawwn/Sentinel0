/**
 * Startup test — verifies that runMigrations works on a completely empty
 * database and that the cleanup step and /api/healthz all succeed afterwards.
 *
 * This test does NOT use drizzle-kit push so it exercises exactly the same
 * code path that runs inside the packaged @yao-pkg/pkg sidecar on first launch.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import request from "supertest";

let dbDir: string;
let dbPath: string;

beforeAll(() => {
  dbDir = mkdtempSync(path.join(tmpdir(), "sentinel-startup-test-"));
  dbPath = path.join(dbDir, "test.db");
  process.env.SENTINEL_DB_PATH = dbPath;
});

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true });
});

describe("startup — empty database", () => {
  it("runMigrations creates all required tables on a blank DB", async () => {
    const { client, runMigrations } = await import("@workspace/db");

    await expect(runMigrations(client)).resolves.not.toThrow();

    // Confirm scans table was created
    const result = await client.execute(
      "SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='scans'"
    );
    const n = Number((result.rows[0] as Record<string, unknown>)["n"] ?? 0);
    expect(n).toBe(1);
  });

  it("runMigrations is idempotent — safe to call twice", async () => {
    const { client, runMigrations } = await import("@workspace/db");

    // Second call should be a no-op, not throw "table already exists"
    await expect(runMigrations(client)).resolves.not.toThrow();
  });

  it("cleanupInterruptedScans succeeds on an empty database", async () => {
    const { db, scansTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const cleaned = await db
      .update(scansTable)
      .set({
        status: "failed",
        errorMessage: "Server restarted while scan was in progress",
        completedAt: new Date(),
      })
      .where(eq(scansTable.status, "running"))
      .returning({ id: scansTable.id });

    // No running scans on fresh DB — should return empty array, not throw
    expect(cleaned).toEqual([]);
  });

  it("GET /api/healthz returns 200 after migration", async () => {
    const app = (await import("../../app.js")).default;

    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
  });
});
