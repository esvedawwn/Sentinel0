import { Router, type IRouter } from "express";
import {
  db,
  userSettingsTable,
  findingsTable,
  filesTable,
  activityTable,
  aiClassificationsTable,
  semanticTagsTable,
  duplicateGroupsTable,
  fileHashesTable,
  extractedTextTable,
  entitiesTable,
  embeddingChunksTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Settings is a singleton row (id=1). Every field defaults to the safest,
 * fully-offline, opt-in posture — extraction/OCR must be explicitly enabled,
 * and cloud processing additionally requires cloudConsent.
 */
async function getOrCreateSettings() {
  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.id, 1));
  if (existing) return existing;

  const [created] = await db
    .insert(userSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [row] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.id, 1));
  return row;
}

function mapSettings(s: typeof userSettingsTable.$inferSelect) {
  return {
    textExtractionEnabled: s.textExtractionEnabled,
    ocrEnabled: s.ocrEnabled,
    localOnlyProcessing: s.localOnlyProcessing,
    cloudConsent: s.cloudConsent,
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(mapSettings(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await getOrCreateSettings();

  // OCR/cloud processing cannot be silently upgraded to cloud without
  // explicit consent — if cloudConsent isn't being granted in this same
  // request, localOnlyProcessing can never be turned off.
  const patch = { ...body.data };
  if (patch.localOnlyProcessing === false && patch.cloudConsent !== true) {
    const [current] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.id, 1));
    if (!current?.cloudConsent) {
      res.status(409).json({ error: "Disabling local-only processing requires cloudConsent to be granted explicitly." });
      return;
    }
  }

  const [updated] = await db
    .update(userSettingsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSettingsTable.id, 1))
    .returning();

  res.json(mapSettings(updated));
});

// ── Privacy / index management ────────────────────────────────────────────────

/**
 * GET /settings/index-location
 * Returns the path of the SQLite database file used for this Sentinel instance.
 * In the desktop app this is ~/Library/Application Support/dev.sentinel.app/sentinel.db.
 * In the web app it defaults to ~/.sentinel/sentinel.db.
 */
router.get("/settings/index-location", (_req, res): void => {
  const dbPath = process.env.SENTINEL_DB_PATH ?? "~/.sentinel/sentinel.db (default)";
  res.json({ path: dbPath });
});

/**
 * DELETE /settings/index
 * Clears all indexed scan metadata: findings, files, activity, AI classifications,
 * semantic tags, duplicate groups, and file hashes. Does NOT delete scan roots,
 * user settings, search history, saved searches, or any file on disk.
 *
 * This is an irreversible operation — the user must confirm in the UI before calling.
 */
router.delete("/settings/index", async (_req, res): Promise<void> => {
  // Order matters — child tables must be cleared before parents (FK constraints)
  await db.delete(aiClassificationsTable);
  await db.delete(semanticTagsTable);
  await db.delete(fileHashesTable);
  await db.delete(findingsTable);
  await db.delete(filesTable);
  await db.delete(duplicateGroupsTable);
  await db.delete(activityTable);

  res.json({
    cleared: ["findings", "files", "activity", "aiClassifications", "semanticTags", "duplicateGroups", "fileHashes"],
    message: "All indexed scan metadata has been cleared. Scan roots and settings are preserved.",
  });
});

/**
 * DELETE /settings/extracted-text
 * Clears all extracted text and detected entities. Embeddings that reference
 * extracted text rows are cascade-deleted automatically (FK onDelete: cascade).
 * Original files on disk are never touched.
 */
router.delete("/settings/extracted-text", async (_req, res): Promise<void> => {
  await db.delete(entitiesTable);
  await db.delete(embeddingChunksTable);
  await db.delete(extractedTextTable);

  res.json({
    cleared: ["extractedText", "entities", "embeddingChunks"],
    message: "All extracted text, entities, and derived embeddings have been cleared.",
  });
});

/**
 * DELETE /settings/embeddings
 * Clears only the embedding vectors (embeddingChunks). Extracted text and
 * entity records are preserved. Useful for freeing space without re-extraction.
 */
router.delete("/settings/embeddings", async (_req, res): Promise<void> => {
  const result = await db.delete(embeddingChunksTable).returning({ id: embeddingChunksTable.id });

  res.json({
    cleared: ["embeddingChunks"],
    deletedCount: result.length,
    message: `${result.length} embedding chunk(s) deleted. Extracted text and entities are preserved.`,
  });
});

export default router;
