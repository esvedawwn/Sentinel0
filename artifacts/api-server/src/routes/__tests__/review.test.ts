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

async function createFinding(overrides: Record<string, unknown> = {}) {
  const { db, scansTable, findingsTable } = await import("@workspace/db");
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
      ...overrides,
    })
    .returning();

  return finding;
}

describe("findings review workflow", () => {
  it("marking a finding reviewed updates reviewStatus and writes an audit entry, without touching findingStatus", async () => {
    const app = (await import("../../app.js")).default;
    const finding = await createFinding();

    const res = await request(app)
      .patch(`/api/findings/${finding.id}/review`)
      .send({ action: "mark_reviewed", note: "looks fine" });

    expect(res.status).toBe(200);
    expect(res.body.reviewStatus).toBe("reviewed");
    expect(res.body.findingStatus).toBe("review");

    const auditRes = await request(app).get(`/api/findings/${finding.id}/audit`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.entries).toHaveLength(1);
    expect(auditRes.body.entries[0].action).toBe("mark_reviewed");
    expect(auditRes.body.entries[0].note).toBe("looks fine");
  });

  it("accepting a recommendation only ever queues a proposed action — it never modifies the finding's path or deletes it", async () => {
    const { db, findingsTable } = await import("@workspace/db");
    const app = (await import("../../app.js")).default;
    const finding = await createFinding({
      aiSuggestedAction: "Move to Archives",
      aiSuggestedDestination: "/Organised/Archives",
    });

    const res = await request(app).patch(`/api/findings/${finding.id}/review`).send({ action: "accept_recommendation" });
    expect(res.status).toBe(200);
    expect(res.body.reviewStatus).toBe("accepted");
    expect(res.body.path).toBe(finding.path);

    const [stillExists] = await db.select().from(findingsTable).where(eq(findingsTable.id, finding.id));
    expect(stillExists).toBeTruthy();
    expect(stillExists.path).toBe(finding.path);

    const queueRes = await request(app).get("/api/action-queue");
    expect(queueRes.status).toBe(200);
    const item = queueRes.body.items.find((i: { findingId: number }) => i.findingId === finding.id);
    expect(item).toBeTruthy();
    expect(item.status).toBe("pending");
    expect(item.proposedDestination).toBe("/Organised/Archives");
  });

  it("bulk review applies the action to every id and records one audit entry per finding", async () => {
    const app = (await import("../../app.js")).default;
    const a = await createFinding();
    const b = await createFinding();

    const res = await request(app)
      .post("/api/findings/bulk-review")
      .send({ ids: [a.id, b.id], action: "reject_recommendation" });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    for (const finding of [a, b]) {
      const auditRes = await request(app).get(`/api/findings/${finding.id}/audit`);
      expect(auditRes.body.entries).toHaveLength(1);
      expect(auditRes.body.entries[0].newReviewStatus).toBe("rejected");
    }
  });

  it("dismissing a queued action never executes it — it only flips its status", async () => {
    const app = (await import("../../app.js")).default;
    const finding = await createFinding({
      aiSuggestedAction: "Delete",
      aiSuggestedDestination: null,
    });
    await request(app).patch(`/api/findings/${finding.id}/review`).send({ action: "accept_recommendation" });

    const queueRes = await request(app).get("/api/action-queue?status=pending");
    const item = queueRes.body.items.find((i: { findingId: number }) => i.findingId === finding.id);
    expect(item).toBeTruthy();

    const dismissRes = await request(app).post(`/api/action-queue/${item.id}/dismiss`);
    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.status).toBe("dismissed");

    const { db, findingsTable } = await import("@workspace/db");
    const [stillExists] = await db.select().from(findingsTable).where(eq(findingsTable.id, finding.id));
    expect(stillExists).toBeTruthy();
  });
});
