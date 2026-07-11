import { Router, type IRouter } from "express";
import { db, findingsTable, extractedTextTable, entitiesTable, userSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ExtractFindingTextParams, GetFindingExtractionParams, SummarizeFindingParams } from "@workspace/api-zod";
import { extractText, extractorForExtension } from "../extraction/extractors.js";
import { runOcr, OcrConsentError } from "../extraction/ocr.js";
import { detectSensitiveCategories } from "../extraction/sensitiveDetector.js";
import { extractEntities } from "../extraction/entityExtractor.js";

const router: IRouter = Router();

async function getSettings() {
  const [settings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.id, 1));
  return (
    settings ?? {
      textExtractionEnabled: false,
      ocrEnabled: false,
      localOnlyProcessing: true,
      cloudConsent: false,
    }
  );
}

function mapExtraction(e: typeof extractedTextTable.$inferSelect) {
  return {
    id: e.id,
    findingId: e.findingId,
    extractor: e.extractor,
    text: e.text,
    truncated: e.truncated,
    sensitiveCategories: e.sensitiveCategories,
    ocrProvider: e.ocrProvider ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

// Extraction is always per-file, on demand — there is no bulk/automatic
// extraction path anywhere in this app.
router.post("/findings/:id/extract", async (req, res): Promise<void> => {
  const params = ExtractFindingTextParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }

  const settings = await getSettings();
  if (!settings.textExtractionEnabled) {
    res.status(409).json({ error: "Text extraction is disabled in Settings." });
    return;
  }

  const [finding] = await db.select().from(findingsTable).where(eq(findingsTable.id, params.data.id));
  if (!finding) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }

  // eslint-disable-next-line no-useless-assignment
  let extractorResult: { extractor: string; text: string; truncated: boolean } | null = null;

  try {
    extractorResult = await extractText(finding.path, finding.extension);

    if (!extractorResult && !extractorForExtension(finding.extension)) {
      const ocr = await runOcr(finding.path, settings);
      extractorResult = { extractor: "ocr", text: ocr.text, truncated: false };
    }
  } catch (err) {
    if (err instanceof OcrConsentError) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "Extraction failed" });
    return;
  }

  if (!extractorResult) {
    res.status(422).json({ error: "No extractor available for this file type." });
    return;
  }

  const sensitiveCategories = detectSensitiveCategories(extractorResult.text);
  const ocrProvider = extractorResult.extractor === "ocr" ? (settings.localOnlyProcessing ? "local" : "cloud") : null;

  const [saved] = await db
    .insert(extractedTextTable)
    .values({
      findingId: finding.id,
      extractor: extractorResult.extractor as (typeof extractedTextTable.$inferInsert)["extractor"],
      text: extractorResult.text,
      truncated: extractorResult.truncated,
      sensitiveCategories,
      ocrProvider,
    })
    .returning();

  const entities = extractEntities(extractorResult.text);
  if (entities.length > 0) {
    await db.insert(entitiesTable).values(entities.map((e) => ({ findingId: finding.id, ...e })));
  }

  res.json(mapExtraction(saved));
});

router.get("/findings/:id/extraction", async (req, res): Promise<void> => {
  const params = GetFindingExtractionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }

  const [extraction] = await db
    .select()
    .from(extractedTextTable)
    .where(eq(extractedTextTable.findingId, params.data.id))
    .orderBy(desc(extractedTextTable.createdAt))
    .limit(1);

  if (!extraction) {
    res.status(404).json({ error: "No extraction found for this finding" });
    return;
  }

  const entities = await db.select().from(entitiesTable).where(eq(entitiesTable.findingId, params.data.id));

  res.json({
    extraction: mapExtraction(extraction),
    entities: entities.map((e) => ({
      id: e.id,
      findingId: e.findingId,
      type: e.type,
      value: e.value,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

// AI summaries only ever run for one explicitly-selected document — never a
// bulk/background pass — and cloud providers require settings.cloudConsent.
router.post("/findings/:id/summarize", async (req, res): Promise<void> => {
  const params = SummarizeFindingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid finding ID" });
    return;
  }

  const [extraction] = await db
    .select()
    .from(extractedTextTable)
    .where(eq(extractedTextTable.findingId, params.data.id))
    .orderBy(desc(extractedTextTable.createdAt))
    .limit(1);

  if (!extraction) {
    res.status(409).json({ error: "This finding has no extracted text yet — run extraction first." });
    return;
  }

  const settings = await getSettings();
  const requiresCloudConsent = !settings.localOnlyProcessing && !settings.cloudConsent;
  if (requiresCloudConsent) {
    res.status(409).json({
      findingId: params.data.id,
      summary: "",
      provider: "none",
      requiresCloudConsent: true,
    });
    return;
  }

  // Local, non-AI, extractive summary: first ~2 sentences of extracted text.
  // This app does not call a cloud LLM here; a future integration would
  // replace this block only, still gated on the same consent check above.
  const sentences = extraction.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 2).join(" ").slice(0, 500) || "No summarizable text was extracted.";

  res.json({
    findingId: params.data.id,
    summary,
    provider: "local-extractive",
    requiresCloudConsent: false,
  });
});

export default router;
