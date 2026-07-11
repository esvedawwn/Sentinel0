/**
 * Text chunker for embedding generation.
 *
 * Strategy:
 *  1. Split on double-newlines (paragraphs) first.
 *  2. If a paragraph exceeds MAX_CHARS, further split on sentences.
 *  3. Each chunk includes a small overlap (the last sentence of the
 *     previous chunk) so retrieval doesn't cut a passage mid-thought.
 *
 * No chunk ever exceeds MAX_CHARS characters. Empty/whitespace chunks
 * are discarded. The minimum meaningful chunk is MIN_CHARS characters.
 */

export interface TextChunk {
  index: number;
  text: string;
}

const MAX_CHARS = 512;
const MIN_CHARS = 20;
const OVERLAP_CHARS = 80;

function splitSentences(text: string): string[] {
  // Split on ". ", "! ", "? ", or newline, keeping delimiter.
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function safeSplit(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHARS) return [paragraph];

  const sentences = splitSentences(paragraph);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= MAX_CHARS) {
      current = (current + " " + sentence).trim();
    } else {
      if (current.length >= MIN_CHARS) chunks.push(current);
      // Hard-chop sentences that are themselves too long
      if (sentence.length > MAX_CHARS) {
        for (let i = 0; i < sentence.length; i += MAX_CHARS) {
          const slice = sentence.slice(i, i + MAX_CHARS).trim();
          if (slice.length >= MIN_CHARS) chunks.push(slice);
        }
        current = "";
      } else {
        current = sentence;
      }
    }
  }

  if (current.length >= MIN_CHARS) chunks.push(current);
  return chunks;
}

export function chunkText(text: string): TextChunk[] {
  const paragraphs = splitParagraphs(text);
  const raw: string[] = [];

  for (const para of paragraphs) {
    raw.push(...safeSplit(para));
  }

  const chunks: TextChunk[] = [];
  let overlap = "";

  for (let i = 0; i < raw.length; i++) {
    const body = overlap ? `${overlap} ${raw[i]}` : raw[i];
    const trimmed = body.trim().slice(0, MAX_CHARS);
    if (trimmed.length >= MIN_CHARS) {
      chunks.push({ index: i, text: trimmed });
    }
    // Carry last OVERLAP_CHARS of this chunk into next
    overlap = raw[i].length > OVERLAP_CHARS ? raw[i].slice(-OVERLAP_CHARS) : raw[i];
  }

  return chunks;
}

/** Return the top-N most relevant chunks from a set, ranked by overlap with a query. */
export function rankChunks(chunks: TextChunk[], query: string, topN = 3): TextChunk[] {
  const queryTokens = new Set(
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3)
  );

  const scored = chunks.map((chunk) => {
    const tokens = chunk.text.toLowerCase().split(/\s+/);
    const overlap = tokens.filter((t) => queryTokens.has(t)).length;
    return { chunk, score: overlap / Math.max(tokens.length, 1) };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.chunk);
}
