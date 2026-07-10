/**
 * Text extractors — one per supported document kind. Each extractor is
 * synchronous/local, never touches the network, and only ever runs when
 * explicitly triggered for a single finding (see routes/extraction.ts).
 * There is no bulk or automatic extraction path anywhere in this app.
 */

import { readFile } from "node:fs/promises";
import type { ExtractorKind } from "@workspace/db";

const MAX_TEXT_LENGTH = 200_000;

export interface ExtractionOutput {
  extractor: ExtractorKind;
  text: string;
  truncated: boolean;
}

function clip(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_LENGTH) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_LENGTH), truncated: true };
}

const PLAIN_TEXT_EXTENSIONS = new Set(["txt", "log", "md", "markdown"]);
const SOURCE_CODE_EXTENSIONS = new Set([
  "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "cs", "php", "sh", "yaml", "yml", "toml",
]);

/**
 * Pick the extractor kind for a given extension. Returns null when nothing
 * in this app knows how to extract that file type (e.g. binary media).
 */
export function extractorForExtension(extension: string): ExtractorKind | null {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (ext === "pdf") return "pdf";
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) return "txt";
  if (SOURCE_CODE_EXTENSIONS.has(ext)) return "source_code";
  return null;
}

async function extractPlainText(path: string): Promise<ExtractionOutput> {
  const raw = await readFile(path, "utf-8");
  const { text, truncated } = clip(raw);
  return { extractor: "txt", text, truncated };
}

async function extractSourceCode(path: string): Promise<ExtractionOutput> {
  const raw = await readFile(path, "utf-8");
  const { text, truncated } = clip(raw);
  return { extractor: "source_code", text, truncated };
}

async function extractMarkdown(path: string): Promise<ExtractionOutput> {
  const raw = await readFile(path, "utf-8");
  const { text, truncated } = clip(raw);
  return { extractor: "markdown", text, truncated };
}

async function extractJson(path: string): Promise<ExtractionOutput> {
  const raw = await readFile(path, "utf-8");
  let pretty = raw;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // Fall back to raw contents if the file isn't valid JSON.
  }
  const { text, truncated } = clip(pretty);
  return { extractor: "json", text, truncated };
}

async function extractCsv(path: string): Promise<ExtractionOutput> {
  const raw = await readFile(path, "utf-8");
  const { text, truncated } = clip(raw);
  return { extractor: "csv", text, truncated };
}

/**
 * PDF extraction is intentionally a minimal, dependency-free stub: it reads
 * raw bytes and pulls out any `(...)` text-showing operators, which covers
 * simple, uncompressed PDFs used in fixtures/tests. Real-world PDFs (with
 * compressed streams) will yield little/no text — that's an accepted
 * limitation of this architecture pass, not silently faked output.
 */
async function extractPdf(path: string): Promise<ExtractionOutput> {
  const raw = await readFile(path, "latin1");
  const matches = [...raw.matchAll(/\(([^()\\]{2,})\)\s*Tj/g)].map((m) => m[1]);
  const text = matches.join(" ").trim();
  const { text: clipped, truncated } = clip(text);
  return { extractor: "pdf", text: clipped, truncated };
}

export async function extractText(path: string, extension: string): Promise<ExtractionOutput | null> {
  const kind = extractorForExtension(extension);
  if (!kind) return null;

  switch (kind) {
    case "txt":
      return extractPlainText(path);
    case "source_code":
      return extractSourceCode(path);
    case "markdown":
      return extractMarkdown(path);
    case "json":
      return extractJson(path);
    case "csv":
      return extractCsv(path);
    case "pdf":
      return extractPdf(path);
    default:
      return null;
  }
}
