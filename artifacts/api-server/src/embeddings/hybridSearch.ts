/**
 * Hybrid search — combines lexical findings with semantic chunk scores.
 * Used by the search route when semantic results are available.
 *
 * Scoring model:
 *   combinedScore = semanticScore * SEMANTIC_WEIGHT + lexicalRankScore * LEXICAL_WEIGHT
 *
 * lexicalRankScore is rank-normalised [0,1] from the lexical result list.
 * If no semantic index exists (embeddingsEnabled=false or no chunks), falls
 * through to lexical-only (combinedScore = lexicalRankScore).
 */

import { type Finding } from "@workspace/db";
import { type SemanticHit } from "./embeddingService.js";

export const SEMANTIC_WEIGHT = 0.7;
export const LEXICAL_WEIGHT = 0.3;

export interface HybridResult {
  findingId: number;
  semanticScore: number;
  lexicalScore: number;
  combinedScore: number;
  matchedPassage: string | null;
  model: string | null;
}

export function mergeResults(
  lexicalFindings: Finding[],
  semanticHits: SemanticHit[],
  opts: { hybrid: boolean; limit: number }
): HybridResult[] {
  const { hybrid, limit } = opts;

  const lexicalScoreMap = new Map<number, number>();
  lexicalFindings.forEach((f, idx) => {
    // Linear rank-based score [0,1]
    lexicalScoreMap.set(f.id, 1 - idx / Math.max(lexicalFindings.length, 1));
  });

  const combinedMap = new Map<number, HybridResult>();

  for (const hit of semanticHits) {
    const lex = lexicalScoreMap.get(hit.findingId) ?? 0;
    combinedMap.set(hit.findingId, {
      findingId: hit.findingId,
      semanticScore: hit.score,
      lexicalScore: lex,
      combinedScore: hybrid ? hit.score * SEMANTIC_WEIGHT + lex * LEXICAL_WEIGHT : hit.score,
      matchedPassage: hit.chunkText,
      model: hit.model,
    });
  }

  if (hybrid) {
    for (const f of lexicalFindings) {
      if (!combinedMap.has(f.id)) {
        const lex = lexicalScoreMap.get(f.id) ?? 0;
        combinedMap.set(f.id, {
          findingId: f.id,
          semanticScore: 0,
          lexicalScore: lex,
          combinedScore: lex * LEXICAL_WEIGHT,
          matchedPassage: null,
          model: null,
        });
      }
    }
  }

  return [...combinedMap.values()]
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
}

/**
 * Format a combined score as a percentage string for the UI.
 */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
