/**
 * OCR abstraction. Two providers are modeled:
 *  - "local"  — always available, no consent required, no network access.
 *  - "cloud"  — requires explicit user consent (userSettings.cloudConsent)
 *               before it may run; this app does not ship a real cloud OCR
 *               call, this is the seam future work would plug one into.
 *
 * OCR is never triggered automatically for a whole filesystem/scan — it
 * only ever runs per-finding, on demand, from routes/extraction.ts, and
 * only when userSettings.ocrEnabled is true.
 */

export type OcrProvider = "local" | "cloud";

export interface OcrSettings {
  ocrEnabled: boolean;
  localOnlyProcessing: boolean;
  cloudConsent: boolean;
}

export interface OcrResult {
  text: string;
  provider: OcrProvider;
}

export class OcrConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrConsentError";
  }
}

/**
 * Local OCR stub: this app has no bundled OCR engine, so "local" OCR
 * returns an explicit placeholder rather than fabricating extracted text.
 * A real integration (e.g. tesseract.js) would replace this function body
 * only — callers/consent logic stay the same.
 */
async function runLocalOcr(_path: string): Promise<string> {
  return "[OCR not available: no local OCR engine is bundled in this environment]";
}

async function runCloudOcr(_path: string): Promise<string> {
  throw new OcrConsentError("Cloud OCR is not configured in this app.");
}

export async function runOcr(path: string, settings: OcrSettings): Promise<OcrResult> {
  if (!settings.ocrEnabled) {
    throw new OcrConsentError("OCR is disabled in Settings.");
  }

  if (settings.localOnlyProcessing || !settings.cloudConsent) {
    return { text: await runLocalOcr(path), provider: "local" };
  }

  return { text: await runCloudOcr(path), provider: "cloud" };
}
