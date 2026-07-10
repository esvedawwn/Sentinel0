import { Router, type IRouter } from "express";
import { db, userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
