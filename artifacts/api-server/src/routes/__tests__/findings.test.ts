import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import request from "supertest";
import { eq } from "drizzle-orm";

let dbDir: string;
let dbPath: string;

beforeAll(() => {
  dbDir = mkdtempSync(path.join(tmpdir(), "sentinel-test-"));
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

describe("findings ignore/unignore routes", () => {
  it("ignoring a finding marks it ignored without deleting it, and unignoring restores it", async () => {
    const { db, scansTable, findingsTable } = await import("@workspace/db");
    const app = (await import("../../app.js")).default;

    const [scan] = await db
      .insert(scansTable)
      .values({
        path: "/tmp/example",
        mode: "sample",
        status: "completed",
        filesScanned: 1,
        foldersScanned: 0,
        bytesScanned: 100,
        filesTotal: 1,
      })
      .returning();

    const [finding] = await db
      .insert(findingsTable)
      .values({
        scanId: scan.id,
        type: "large_file",
        path: "/tmp/example/file.bin",
        name: "file.bin",
        extension: ".bin",
        sizeBytes: 100,
        findingStatus: "review",
        riskLevel: "medium",
        reason: "Large file",
      })
      .returning();

    const ignoreRes = await request(app)
      .patch(`/api/findings/${finding.id}/ignore`)
      .send({ reason: "not important" });
    expect(ignoreRes.status).toBe(200);
    expect(ignoreRes.body.findingStatus).toBe("ignored");

    const [stillExists] = await db.select().from(findingsTable).where(eq(findingsTable.id, finding.id));
    expect(stillExists).toBeTruthy();

    const unignoreRes = await request(app).patch(`/api/findings/${finding.id}/unignore`);
    expect(unignoreRes.status).toBe(200);
    expect(unignoreRes.body.findingStatus).toBe("review");
  });

  it("returns 404 when ignoring a finding that does not exist", async () => {
    const app = (await import("../../app.js")).default;
    const res = await request(app).patch("/api/findings/999999/ignore").send({});
    expect(res.status).toBe(404);
  });
});
