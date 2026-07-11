import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, projectsTable, projectFilesTable, projectCandidatesTable } from "@workspace/db";
import {
  generateCandidates,
  approveCandidate,
  mergeCandidates,
  splitProject,
  getProjectDetail,
  listCandidates,
} from "../projects/projectService.js";

const router: IRouter = Router();

function mapCandidate(candidate: { id: number; name: string; status: string; score: number; signals: Record<string, number>; explanation: string; createdAt: Date; updatedAt: Date }, findingIds: number[]) {
  return {
    id: candidate.id,
    name: candidate.name,
    status: candidate.status,
    score: parseFloat(candidate.score.toFixed(3)),
    signals: candidate.signals,
    explanation: candidate.explanation,
    findingCount: findingIds.length,
    findingIds,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

// ── Candidates ────────────────────────────────────────────────────────────────

router.get("/projects/candidates", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const results = await listCandidates(status);
  res.json({
    candidates: results.map((r) => mapCandidate(r.candidate as Parameters<typeof mapCandidate>[0], r.findingIds)),
  });
});

router.post("/projects/candidates/generate", async (req, res): Promise<void> => {
  const body = z.object({
    scanId: z.number().int().optional(),
    limit: z.number().int().min(10).max(500).optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const created = await generateCandidates(body.data);
  res.json({
    generated: created.length,
    candidates: created.map((r) => mapCandidate(r.candidate as Parameters<typeof mapCandidate>[0], r.findingIds)),
  });
});

router.post("/projects/candidates/:id/approve", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid candidate ID" }); return; }
  try {
    const project = await approveCandidate(id);
    res.json({ project: { id: project.id, name: project.name, confidence: project.confidence, explanation: project.explanation, createdAt: project.createdAt?.toISOString(), status: project.status } });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Approve failed" });
  }
});

router.post("/projects/candidates/:id/reject", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid candidate ID" }); return; }
  const rows = await db
    .update(projectCandidatesTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(projectCandidatesTable.id, id))
    .returning();
  if (rows.length === 0) { res.status(404).json({ error: "Candidate not found" }); return; }
  res.json({ id, status: "rejected" });
});

router.post("/projects/candidates/merge", async (req, res): Promise<void> => {
  const body = z.object({ candidateIds: z.array(z.number().int()).min(2) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const project = await mergeCandidates(body.data.candidateIds);
    res.json({ project: { id: project.id, name: project.name, confidence: project.confidence, createdAt: project.createdAt?.toISOString(), status: project.status } });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Merge failed" });
  }
});

// ── Projects ──────────────────────────────────────────────────────────────────

router.get("/projects", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = status
    ? await db.select().from(projectsTable).where(eq(projectsTable.status, status as "active" | "archived" | "deleted"))
    : await db.select().from(projectsTable).where(eq(projectsTable.status, "active"));

  // Get file counts
  const allFileLinks = await db.select().from(projectFilesTable);
  const countByProject = new Map<number, number>();
  for (const f of allFileLinks) {
    countByProject.set(f.projectId, (countByProject.get(f.projectId) ?? 0) + 1);
  }

  res.json({
    projects: rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      confidence: parseFloat(p.confidence.toFixed(3)),
      explanation: p.explanation,
      summary: p.summary ?? null,
      fileCount: countByProject.get(p.id) ?? 0,
      createdAt: p.createdAt?.toISOString(),
      updatedAt: p.updatedAt?.toISOString(),
    })),
  });
});

router.post("/projects", async (req, res): Promise<void> => {
  const body = z.object({ name: z.string().min(1), description: z.string().optional() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values({ name: body.data.name, description: body.data.description ?? "", confidence: 1.0, explanation: "Manually created" })
    .returning();
  res.status(201).json({ id: project.id, name: project.name, status: project.status, confidence: project.confidence, createdAt: project.createdAt?.toISOString() });
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }
  try {
    const detail = await getProjectDetail(id);
    res.json({
      project: {
        id: detail.project.id,
        name: detail.project.name,
        description: detail.project.description,
        status: detail.project.status,
        confidence: parseFloat(detail.project.confidence.toFixed(3)),
        explanation: detail.project.explanation,
        summary: detail.project.summary ?? null,
        createdAt: detail.project.createdAt?.toISOString(),
        updatedAt: detail.project.updatedAt?.toISOString(),
      },
      files: detail.files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        extension: f.extension,
        sizeBytes: f.sizeBytes,
        aiCategory: f.aiCategory ?? null,
        aiConfidence: f.aiConfidence ?? null,
        fileModifiedAt: f.fileModifiedAt?.toISOString() ?? null,
      })),
      people: detail.people,
      orgs: detail.orgs,
      categories: detail.categories,
      timeline: detail.timeline.map((t) => ({
        findingId: t.findingId,
        name: t.name,
        date: t.date?.toISOString() ?? null,
      })),
      storageTotalBytes: detail.storageTotalBytes,
    });
  } catch (err: unknown) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }
  const body = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(["active", "archived", "deleted"]).optional(),
    summary: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [updated] = await db
    .update(projectsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(projectsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Project not found" }); return; }
  res.json({ id: updated.id, name: updated.name, status: updated.status, updatedAt: updated.updatedAt?.toISOString() });
});

router.post("/projects/:id/files", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }
  const body = z.object({ findingId: z.number().int() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [link] = await db
    .insert(projectFilesTable)
    .values({ projectId: id, findingId: body.data.findingId, addedBy: "user" })
    .returning();
  res.status(201).json({ projectId: link.projectId, findingId: link.findingId });
});

router.delete("/projects/:id/files/:findingId", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const findingId = parseInt(req.params.findingId, 10);
  if (isNaN(id) || isNaN(findingId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
  await db
    .delete(projectFilesTable)
    .where(
      and(eq(projectFilesTable.projectId, id), eq(projectFilesTable.findingId, findingId))
    );
  res.json({ removed: true, projectId: id, findingId });
});

router.post("/projects/:id/split", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }
  const body = z.object({
    findingIds: z.array(z.number().int()).min(1),
    newName: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const newProject = await splitProject(id, body.data.findingIds, body.data.newName);
    res.json({ newProject: { id: newProject.id, name: newProject.name, createdAt: newProject.createdAt?.toISOString() } });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Split failed" });
  }
});

export default router;
