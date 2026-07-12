/**
 * Unified search service — pure filter-building + query execution against
 * findings. Independent of Express/React so it can be unit tested directly.
 *
 * A search always starts from an optional natural-language `q`, run through
 * the local NL interpreter (`ai/search.ts`), and layers any explicit filter
 * fields on top. Explicit filters always win over whatever the interpreter
 * guessed — the UI lets a user edit the generated filters, and those edits
 * must never be silently overridden.
 *
 * v2 additions:
 *  - mentionedEntity filter (queries entitiesTable)
 *  - extensions[] filter (any of the given extensions)
 *  - findingTypes[] filter
 *  - Hybrid relevance scoring: each result carries a relevanceScore (0–1)
 *    and matchedFactors[] explaining why it ranked where it did.
 */

import { and, eq, gte, lte, like, or, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  findingsTable,
  semanticTagsTable,
  entitiesTable,
  type Finding,
  type RiskLevel,
} from "@workspace/db";
import { interpretSearchQuery, type AppliedFilter } from "../ai/search.js";

// ── Filter types ──────────────────────────────────────────────────────────────

export interface SearchFilters {
  [key: string]: unknown;
  path?: string | null;
  extension?: string | null;
  extensions?: string[] | null;
  category?: string | null;
  aiCategory?: string | null;
  tags?: string[];
  findingTypes?: string[] | null;
  riskLevel?: RiskLevel | null;
  minSizeBytes?: number | null;
  maxSizeBytes?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  scanId?: number | null;
  duplicatesOnly?: boolean;
  mentionedEntity?: string | null;
}

export interface SearchRequest extends SearchFilters {
  q?: string;
  limit?: number;
  offset?: number;
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface ScoredFinding extends Finding {
  relevanceScore: number;
  matchedFactors: string[];
  matchExplanation: string;
}

export interface SearchResult {
  query: string;
  filters: SearchFilters;
  explanation: string;
  confidence: number;
  appliedFilters: AppliedFilter[];
  unrecognizedTerms: string[];
  findings: ScoredFinding[];
  total: number;
}

// ── Category → finding-type mapping ──────────────────────────────────────────

const CATEGORY_TO_FINDING_TYPE: Record<string, string> = {
  "Duplicate Candidates": "duplicate",
  Installers: "installer",
  Archives: "archive",
  "Lock Files": "idlk_file",
};

// ── Filter building ───────────────────────────────────────────────────────────

/**
 * Merge a natural-language interpretation with any explicit filter overrides.
 * Explicit filters always take priority over whatever the interpreter guessed.
 */
export function buildFilters(
  request: SearchRequest
): { filters: SearchFilters; explanation: string; confidence: number; appliedFilters: AppliedFilter[]; unrecognizedTerms: string[] } {
  const interpretation = request.q?.trim() ? interpretSearchQuery(request.q) : null;

  const filters: SearchFilters = {
    path: request.path ?? null,
    extension: request.extension ?? null,
    extensions: request.extensions ?? (interpretation?.extensions?.length ? interpretation.extensions : null),
    category: request.category ?? interpretation?.categories[0] ?? null,
    aiCategory: request.aiCategory ?? interpretation?.categories[0] ?? null,
    tags: request.tags ?? interpretation?.tags ?? [],
    findingTypes: request.findingTypes ?? (interpretation?.findingTypes?.length ? interpretation.findingTypes : null),
    riskLevel: request.riskLevel ?? null,
    minSizeBytes: request.minSizeBytes ?? interpretation?.minSizeBytes ?? null,
    maxSizeBytes: request.maxSizeBytes ?? interpretation?.maxSizeBytes ?? null,
    dateFrom: request.dateFrom ?? (interpretation?.dateFrom ? interpretation.dateFrom.toISOString() : null),
    dateTo: request.dateTo ?? (interpretation?.dateTo ? interpretation.dateTo.toISOString() : null),
    scanId: request.scanId ?? null,
    duplicatesOnly:
      request.duplicatesOnly ?? interpretation?.statuses.includes("duplicate") ?? false,
    mentionedEntity: request.mentionedEntity ?? interpretation?.mentionedEntity ?? null,
  };

  const explanation =
    interpretation?.explanation ??
    "No natural-language query provided — using explicit filters only.";

  return {
    filters,
    explanation,
    confidence: interpretation?.confidence ?? 1,
    appliedFilters: interpretation?.appliedFilters ?? [],
    unrecognizedTerms: interpretation?.unrecognizedTerms ?? [],
  };
}

// ── WHERE clause construction ─────────────────────────────────────────────────

/**
 * Turn a resolved filter set into a Drizzle WHERE clause against `findings`.
 * Pure/synchronous — no DB access, only clause construction.
 */
export function filtersToWhereClause(filters: SearchFilters, plainTextQuery?: string): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.path?.trim()) {
    conditions.push(like(findingsTable.path, `%${filters.path.trim()}%`));
  }

  // Single extension (from explicit param)
  if (filters.extension?.trim()) {
    conditions.push(eq(findingsTable.extension, filters.extension.trim().replace(/^\./, "")));
  }
  // Multiple extensions (from NL interpretation or multi-select)
  if (filters.extensions?.length) {
    const exts = filters.extensions.map((e) => e.replace(/^\./, ""));
    conditions.push(inArray(findingsTable.extension, exts));
  }

  if (filters.aiCategory?.trim()) {
    conditions.push(eq(findingsTable.aiCategory, filters.aiCategory.trim()));
  } else if (filters.category?.trim()) {
    const mappedType = CATEGORY_TO_FINDING_TYPE[filters.category.trim()];
    if (mappedType) {
      conditions.push(eq(findingsTable.type, mappedType as Finding["type"]));
    } else {
      conditions.push(eq(findingsTable.aiCategory, filters.category.trim()));
    }
  }

  // Finding types (from NL or explicit)
  if (filters.findingTypes?.length) {
    conditions.push(inArray(findingsTable.type, filters.findingTypes as Finding["type"][]));
  }

  if (filters.riskLevel) {
    conditions.push(eq(findingsTable.riskLevel, filters.riskLevel));
  }
  if (filters.minSizeBytes != null) {
    conditions.push(gte(findingsTable.sizeBytes, filters.minSizeBytes));
  }
  if (filters.maxSizeBytes != null) {
    conditions.push(lte(findingsTable.sizeBytes, filters.maxSizeBytes));
  }
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!isNaN(from.getTime())) conditions.push(gte(findingsTable.fileModifiedAt, from));
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!isNaN(to.getTime())) conditions.push(lte(findingsTable.fileModifiedAt, to));
  }
  if (filters.scanId != null) {
    conditions.push(eq(findingsTable.scanId, filters.scanId));
  }
  if (filters.duplicatesOnly) {
    conditions.push(eq(findingsTable.type, "duplicate"));
  }
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(
      sql`${findingsTable.id} in (select ${semanticTagsTable.findingId} from ${semanticTagsTable} where ${or(
        ...filters.tags.map((t) => like(semanticTagsTable.tag, `%${t}%`))
      )})`
    );
  }

  // Entity mention filter — subquery into entitiesTable
  if (filters.mentionedEntity?.trim()) {
    const entityTerm = `%${filters.mentionedEntity.trim()}%`;
    conditions.push(
      sql`${findingsTable.id} in (
        select ${entitiesTable.findingId} from ${entitiesTable}
        where ${like(entitiesTable.value, entityTerm)}
      )`
    );
  }

  if (plainTextQuery?.trim()) {
    const term = `%${plainTextQuery.trim()}%`;
    conditions.push(or(like(findingsTable.name, term), like(findingsTable.path, term))!);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Whether a plain-text fallback search term should be applied — only when
 * the NL interpreter found nothing structured to filter on.
 */
export function shouldFallbackToPlainText(q: string | undefined, filters: SearchFilters): string | undefined {
  if (!q?.trim()) return undefined;
  const structuredHitFound =
    !!filters.category ||
    !!filters.aiCategory ||
    !!filters.extension ||
    (filters.extensions?.length ?? 0) > 0 ||
    (filters.findingTypes?.length ?? 0) > 0 ||
    filters.minSizeBytes != null ||
    filters.duplicatesOnly ||
    !!filters.mentionedEntity;
  return structuredHitFound ? undefined : q.trim();
}

// ── Hybrid relevance scoring ──────────────────────────────────────────────────

/**
 * Score a batch of findings for relevance against the original query and resolved filters.
 * Returns the same findings sorted by descending relevance, each annotated with
 * `relevanceScore` (0–1), `matchedFactors[]`, and `matchExplanation`.
 *
 * This is post-filter scoring — all findings already satisfy the WHERE clause;
 * we're ranking them for the user's benefit. Pure/synchronous, no DB access.
 */
export function scoreFindings(
  findings: Finding[],
  q: string | undefined,
  filters: SearchFilters
): ScoredFinding[] {
  const queryLower = q?.trim().toLowerCase() ?? "";
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length >= 2);

  const scored: ScoredFinding[] = findings.map((finding) => {
    let score = 0;
    const factors: string[] = [];
    const nameLower = finding.name.toLowerCase();
    const pathLower = finding.path.toLowerCase();

    // Filename exact match (highest weight)
    if (queryLower && nameLower === queryLower) {
      score += 0.5;
      factors.push(`exact filename match "${finding.name}"`);
    } else if (queryLower && nameLower.includes(queryLower)) {
      score += 0.35;
      factors.push(`filename contains "${q}"`);
    } else if (queryTerms.length > 0 && queryTerms.some((t) => nameLower.includes(t))) {
      const hits = queryTerms.filter((t) => nameLower.includes(t));
      score += 0.25 * Math.min(hits.length / queryTerms.length, 1);
      factors.push(`filename matched term${hits.length > 1 ? "s" : ""} "${hits.join(", ")}"`);
    }

    // Path match (lower weight)
    if (queryLower && pathLower.includes(queryLower)) {
      score += 0.1;
      factors.push("path match");
    } else if (queryTerms.some((t) => pathLower.includes(t))) {
      score += 0.05;
      factors.push("partial path match");
    }

    // AI category match
    if (finding.aiCategory && filters.aiCategory && finding.aiCategory === filters.aiCategory) {
      score += 0.2;
      factors.push(`AI category: ${finding.aiCategory}`);
    } else if (finding.aiCategory && filters.category && finding.aiCategory === filters.category) {
      score += 0.15;
      factors.push(`category: ${finding.aiCategory}`);
    }

    // AI confidence bonus (higher-confidence classifications rank slightly higher)
    if (finding.aiConfidence && finding.aiConfidence >= 90) {
      score += 0.05;
    }

    // Duplicate status bonus when user searched for duplicates
    if (filters.duplicatesOnly && finding.type === "duplicate") {
      score += 0.1;
      factors.push("duplicate match");
    }

    // Extension match bonus
    if (filters.extension && finding.extension === filters.extension.replace(/^\./, "")) {
      score += 0.1;
      factors.push(`.${finding.extension} extension`);
    }
    if (filters.extensions?.includes(finding.extension)) {
      score += 0.1;
      factors.push(`.${finding.extension} extension`);
    }

    // Risk level match
    if (filters.riskLevel && finding.riskLevel === filters.riskLevel) {
      score += 0.05;
      factors.push(`risk: ${finding.riskLevel}`);
    }

    // Base score so every result has something
    if (score === 0) score = 0.01;

    // Clamp to [0, 1]
    score = Math.min(score, 1);

    // Build human-readable explanation
    let matchExplanation =
      factors.length > 0
        ? `Ranked because: ${factors.join("; ")}.`
        : "Matched by applied filter.";

    if (finding.aiCategory) {
      matchExplanation += ` File is classified as "${finding.aiCategory}"`;
      if (finding.aiConfidence) matchExplanation += ` (${finding.aiConfidence}% confidence)`;
      matchExplanation += ".";
    }

    return {
      ...finding,
      relevanceScore: parseFloat(score.toFixed(3)),
      matchedFactors: factors,
      matchExplanation,
    };
  });

  // Sort by relevance descending, then by createdAt ascending as tiebreaker
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored;
}

// ── Main search entry point ───────────────────────────────────────────────────

export async function runSearch(request: SearchRequest): Promise<SearchResult> {
  const { filters, explanation, confidence, appliedFilters, unrecognizedTerms } = buildFilters(request);
  const plainTextQuery = shouldFallbackToPlainText(request.q, filters);
  const whereClause = filtersToWhereClause(filters, plainTextQuery);

  const limit = request.limit ?? 100;
  const offset = request.offset ?? 0;

  const [rawFindings, totalRows] = await Promise.all([
    db.select().from(findingsTable).where(whereClause).orderBy(findingsTable.createdAt).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(findingsTable).where(whereClause),
  ]);

  const findings = scoreFindings(rawFindings, request.q, filters);

  return {
    query: request.q ?? "",
    filters,
    explanation,
    confidence,
    appliedFilters,
    unrecognizedTerms,
    findings,
    total: Number(totalRows[0]?.total ?? 0),
  };
}
