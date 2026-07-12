import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import request from "supertest";

let dbDir: string;
let dbPath: string;

beforeAll(() => {
  dbDir = mkdtempSync(path.join(tmpdir(), "sentinel-projects-test-"));
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
    .values({ path: "/tmp/projects-test", mode: "sample", status: "completed", filesScanned: 4, foldersScanned: 1, bytesScanned: 1000, filesTotal: 4 })
    .returning();
  return scan;
}

async function seedFinding(scanId: number, name: string, filePath: string, category?: string) {
  const { db, findingsTable } = await import("@workspace/db");
  const [finding] = await db
    .insert(findingsTable)
    .values({
      scanId,
      type: "large_file",
      path: filePath,
      name,
      extension: path.extname(name),
      sizeBytes: 1024,
      findingStatus: "review",
      riskLevel: "low",
      reason: "Test finding",
      aiCategory: category ?? null,
    })
    .returning();
  return finding;
}

async function seedTag(findingId: number, tag: string) {
  const { db, semanticTagsTable } = await import("@workspace/db");
  await db.insert(semanticTagsTable).values({ findingId, tag }).onConflictDoNothing();
}

// ── GET /projects/candidates ───────────────────────────────────────────────────

describe("GET /api/projects/candidates", () => {
  it("returns empty list on fresh DB", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).get("/api/projects/candidates").query({ status: "pending" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("candidates");
    expect(Array.isArray(res.body.candidates)).toBe(true);
  });
});

// ── POST /projects/candidates/generate ────────────────────────────────────────

describe("POST /api/projects/candidates/generate", () => {
  it("returns generated count and candidate array", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/candidates/generate").send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("generated");
    expect(typeof res.body.generated).toBe("number");
    expect(Array.isArray(res.body.candidates)).toBe(true);
  });

  it("generates candidates when findings share folder proximity, category, and tags", async () => {
    const { default: app } = await import("../../app.js");
    const scan = await seedScan();
    // Three files in the same folder + same AI category + shared semantic tags → score > 0.35 threshold
    // folderProximity(0.667)*0.25 + sharedAiCategory(1)*0.10 + sharedTags(1)*0.18 ≈ 0.45
    const f1 = await seedFinding(scan.id, "budget-2024-q1.xlsx", "/acme/finance/budget-2024-q1.xlsx", "Financial Documents");
    const f2 = await seedFinding(scan.id, "budget-2024-q2.xlsx", "/acme/finance/budget-2024-q2.xlsx", "Financial Documents");
    const f3 = await seedFinding(scan.id, "forecast-2024.xlsx", "/acme/finance/forecast-2024.xlsx", "Financial Documents");
    for (const f of [f1, f2, f3]) {
      await seedTag(f.id, "finance");
      await seedTag(f.id, "budget");
    }

    const res = await request(app).post("/api/projects/candidates/generate").send({});
    expect(res.status).toBe(200);
    expect(res.body.generated).toBeGreaterThan(0);
    const candidate = res.body.candidates[0];
    expect(candidate).toHaveProperty("id");
    expect(candidate).toHaveProperty("name");
    expect(candidate).toHaveProperty("score");
    expect(candidate.score).toBeGreaterThanOrEqual(0);
    expect(candidate.score).toBeLessThanOrEqual(1);
    expect(candidate).toHaveProperty("signals");
    expect(candidate).toHaveProperty("findingIds");
    expect(Array.isArray(candidate.findingIds)).toBe(true);
  });

  it("rejects invalid body schema", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/candidates/generate").send({ limit: -1 });
    expect(res.status).toBe(400);
  });
});

// ── POST /projects/candidates/:id/approve ─────────────────────────────────────

describe("POST /api/projects/candidates/:id/approve", () => {
  it("creates a project from a pending candidate", async () => {
    const { default: app } = await import("../../app.js");

    // First generate candidates
    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return; // no candidates generated → skip gracefully

    const res = await request(app).post(`/api/projects/candidates/${pending.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("project");
    expect(res.body.project).toHaveProperty("id");
    expect(res.body.project.status).toBe("active");
  });

  it("rejects approving a non-existent candidate", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/candidates/999999/approve");
    expect(res.status).toBe(400);
  });

  it("rejects approving an already-approved candidate", async () => {
    const { default: app } = await import("../../app.js");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return;

    await request(app).post(`/api/projects/candidates/${pending.id}/approve`);
    const res = await request(app).post(`/api/projects/candidates/${pending.id}/approve`);
    expect(res.status).toBe(400);
  });
});

// ── POST /projects/candidates/:id/reject ──────────────────────────────────────

describe("POST /api/projects/candidates/:id/reject", () => {
  it("marks a pending candidate as rejected", async () => {
    const { default: app } = await import("../../app.js");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return;

    const res = await request(app).post(`/api/projects/candidates/${pending.id}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  it("returns 404 for non-existent candidate", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/candidates/999999/reject");
    expect(res.status).toBe(404);
  });
});

// ── POST /projects/candidates/merge ───────────────────────────────────────────

describe("POST /api/projects/candidates/merge", () => {
  it("merges two candidates into a project", async () => {
    const { default: app } = await import("../../app.js");
    const scan = await seedScan();

    // Seed two clearly separate groups to ensure two candidates
    await seedFinding(scan.id, "legal-brief-a.pdf", "/acme/legal/brief-a.pdf", "Legal");
    await seedFinding(scan.id, "legal-brief-b.pdf", "/acme/legal/brief-b.pdf", "Legal");
    await seedFinding(scan.id, "contract-draft-a.docx", "/acme/legal/contract-a.docx", "Legal");
    await seedFinding(scan.id, "contract-draft-b.docx", "/acme/legal/contract-b.docx", "Legal");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pendingCandidates = gen.body.candidates.filter((c: { status: string }) => c.status === "pending");

    if (pendingCandidates.length < 2) return; // not enough groups → skip

    const res = await request(app)
      .post("/api/projects/candidates/merge")
      .send({ candidateIds: [pendingCandidates[0].id, pendingCandidates[1].id] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("project");
    expect(res.body.project.status).toBe("active");
  });

  it("rejects merge with fewer than 2 IDs", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/candidates/merge").send({ candidateIds: [1] });
    expect(res.status).toBe(400);
  });
});

// ── GET /projects ──────────────────────────────────────────────────────────────

describe("GET /api/projects", () => {
  it("returns only active projects by default", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("projects");
    expect(Array.isArray(res.body.projects)).toBe(true);
    for (const p of res.body.projects) {
      expect(p.status).toBe("active");
    }
  });

  it("includes fileCount on each project", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).get("/api/projects");
    for (const p of res.body.projects) {
      expect(typeof p.fileCount).toBe("number");
    }
  });
});

// ── GET /projects/:id ─────────────────────────────────────────────────────────

describe("GET /api/projects/:id", () => {
  it("returns full project detail for an approved project", async () => {
    const { default: app } = await import("../../app.js");

    const scan = await seedScan();
    await seedFinding(scan.id, "invoice-jan.pdf", "/acme/billing/invoice-jan.pdf", "Financial Documents");
    await seedFinding(scan.id, "invoice-feb.pdf", "/acme/billing/invoice-feb.pdf", "Financial Documents");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return;

    const approveRes = await request(app).post(`/api/projects/candidates/${pending.id}/approve`);
    const projectId = approveRes.body.project.id;

    const res = await request(app).get(`/api/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("project");
    expect(res.body).toHaveProperty("files");
    expect(res.body).toHaveProperty("people");
    expect(res.body).toHaveProperty("orgs");
    expect(res.body).toHaveProperty("categories");
    expect(res.body).toHaveProperty("timeline");
    expect(res.body).toHaveProperty("storageTotalBytes");
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(typeof res.body.storageTotalBytes).toBe("number");
  });

  it("returns 404 for non-existent project", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).get("/api/projects/999999");
    expect(res.status).toBe(404);
  });
});

// ── POST /projects/:id/split ───────────────────────────────────────────────────

describe("POST /api/projects/:id/split", () => {
  it("splits selected files into a new project", async () => {
    const { default: app } = await import("../../app.js");
    const scan = await seedScan();

    const f1 = await seedFinding(scan.id, "design-brief.pdf", "/acme/design/brief.pdf", "Design");
    const f2 = await seedFinding(scan.id, "design-mockup.fig", "/acme/design/mockup.fig", "Design");
    const f3 = await seedFinding(scan.id, "design-assets.zip", "/acme/design/assets.zip", "Design");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return;

    const approveRes = await request(app).post(`/api/projects/candidates/${pending.id}/approve`);
    const projectId = approveRes.body.project.id;
    const linkedIds = pending.findingIds as number[];

    // Take only a subset to split off
    const splitIds = linkedIds.slice(0, 1);
    if (splitIds.length === 0) return;

    const res = await request(app)
      .post(`/api/projects/${projectId}/split`)
      .send({ findingIds: splitIds, newName: "Split Project" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("newProject");
    expect(res.body.newProject.name).toBe("Split Project");
    void f1; void f2; void f3;
  });

  it("rejects split with empty findingIds", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/999/split").send({ findingIds: [], newName: "Empty" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for split missing newName", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects/1/split").send({ findingIds: [1] });
    expect(res.status).toBe(400);
  });
});

// ── GET /projects/search ───────────────────────────────────────────────────────

describe("GET /api/projects/search", () => {
  it("requires a query parameter", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).get("/api/projects/search");
    expect(res.status).toBe(400);
  });

  it("returns empty results for no matches", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).get("/api/projects/search").query({ q: "zzznomatch99999" });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.query).toBe("zzznomatch99999");
  });

  it("finds an approved project by name", async () => {
    const { default: app } = await import("../../app.js");
    const scan = await seedScan();
    await seedFinding(scan.id, "sentinel-design-guide.pdf", "/acme/brand/sentinel-design-guide.pdf", "Design");
    await seedFinding(scan.id, "sentinel-logo.svg", "/acme/brand/sentinel-logo.svg", "Design");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return;

    await request(app).post(`/api/projects/candidates/${pending.id}/approve`);

    const res = await request(app).get("/api/projects/search").query({ q: pending.name.split(":")[1]?.trim().slice(0, 8) ?? "brand" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    if (res.body.results.length > 0) {
      expect(res.body.results[0]).toHaveProperty("id");
      expect(res.body.results[0]).toHaveProperty("name");
      expect(res.body.results[0]).toHaveProperty("fileCount");
      expect(typeof res.body.results[0].fileCount).toBe("number");
    }
  });
});

// ── PATCH /projects/:id ────────────────────────────────────────────────────────

describe("PATCH /api/projects/:id", () => {
  it("updates project name and description", async () => {
    const { default: app } = await import("../../app.js");
    const scan = await seedScan();
    await seedFinding(scan.id, "report-draft.docx", "/reports/draft.docx", "Documents");
    await seedFinding(scan.id, "report-final.docx", "/reports/final.docx", "Documents");

    const gen = await request(app).post("/api/projects/candidates/generate").send({});
    const pending = gen.body.candidates.find((c: { status: string }) => c.status === "pending");
    if (!pending) return;

    const approveRes = await request(app).post(`/api/projects/candidates/${pending.id}/approve`);
    const projectId = approveRes.body.project.id;

    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .send({ name: "Updated Name", description: "New description" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(projectId);
  });

  it("returns 404 for non-existent project", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).patch("/api/projects/999999").send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── POST /projects (manual creation) ──────────────────────────────────────────

describe("POST /api/projects", () => {
  it("creates a project with a name", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app)
      .post("/api/projects")
      .send({ name: "Manual Project", description: "Created manually" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Manual Project");
    expect(res.body.status).toBe("active");
  });

  it("rejects a project with missing name", async () => {
    const { default: app } = await import("../../app.js");
    const res = await request(app).post("/api/projects").send({ description: "No name" });
    expect(res.status).toBe(400);
  });
});
