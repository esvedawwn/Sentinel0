/**
 * Unified search service — pure filter-building + query execution against
 * findings. Independent of Express/React so it can be unit tested directly.
 *
 * A search always starts from an optional natural-language `q`, run through
 * the existing local NL interpreter (`ai/search.ts`), and layers any
 * explicit filter fields on top. Explicit filters always win over whatever
 * the interpreter guessed — the UI lets a user edit the generated filters,
 * and those edits must never be silently overridden.
 */

import { and, eq, gte, lte, like, or, sql, type SQL } from "drizzle-orm";
import { db, findingsTable, semanticTagsTable, type Finding, type RiskLevel } from "@workspace/db";
import { interpretSearchQuery } from "../ai/search.js";

export interface SearchFilters {
  [key: string]: unknown;
  path?: string | null;
  extension?: string | null;
  category?: string | null;
  aiCategory?: string | null;
  tags?: string[];
  riskLevel?: RiskLevel | null;
  minSizeBytes?: number | null;
  maxSizeBytes?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  scanId?: number | null;
  duplicatesOnly?: boolean;
}

export interface SearchRequest extends SearchFilters {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  query: string;
  filters: SearchFilters;
  explanation: string;
  findings: Finding[];
  total: number;
}

const CATEGORY_TO_FINDING_TYPE: Record<string, string> = {
  "Duplicate Candidates": "duplicate",
  Installers: "installer",
  Archives: "archive",
  "Lock Files": "idlk_file",
};

/**
 * Merge a natural-language interpretation with any explicit filter overrides
 * the caller supplied. Explicit filters always take priority.
 */
export function buildFilters(request: SearchRequest): { filters: SearchFilters; explanation: string } {
  const interpretation = request.q?.trim() ? interpretSearchQuery(request.q) : null;

  const filters: SearchFilters = {
    path: request.path ?? null,
    extension: request.extension ?? null,
    category: request.category ?? interpretation?.categories[0] ?? null,
    aiCategory: request.aiCategory ?? interpretation?.categories[0] ?? null,
    tags: request.tags ?? interpretation?.tags ?? [],
    riskLevel: request.riskLevel ?? null,
    minSizeBytes: request.minSizeBytes ?? interpretation?.minSizeBytes ?? null,
    maxSizeBytes: request.maxSizeBytes ?? null,
    dateFrom: request.dateFrom ?? null,
    dateTo: request.dateTo ?? null,
    scanId: request.scanId ?? null,
    duplicatesOnly:
      request.duplicatesOnly ?? interpretation?.statuses.includes("duplicate") ?? false,
  };

  const explanation = interpretation?.explanation ?? "No natural-language query provided — using explicit filters only.";

  return { filters, explanation };
}

/**
 * Turn a resolved filter set into a Drizzle WHERE clause against `findings`.
 * Pure/synchronous — no DB access here, only clause construction, so it's
 * trivially testable.
 */
export function filtersToWhereClause(filters: SearchFilters, plainTextQuery?: string): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.path?.trim()) {
    conditions.push(like(findingsTable.path, `%${filters.path.trim()}%`));
  }
  if (filters.extension?.trim()) {
    conditions.push(eq(findingsTable.extension, filters.extension.trim().replace(/^\./, "")));
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
    !!filters.category || !!filters.aiCategory || filters.minSizeBytes != null || filters.duplicatesOnly;
  return structuredHitFound ? undefined : q.trim();
}

export async function runSearch(request: SearchRequest): Promise<SearchResult> {
  const { filters, explanation } = buildFilters(request);
  const plainTextQuery = shouldFallbackToPlainText(request.q, filters);
  const whereClause = filtersToWhereClause(filters, plainTextQuery);

  const limit = request.limit ?? 100;
  const offset = request.offset ?? 0;

  const [findings, totalRows] = await Promise.all([
    db.select().from(findingsTable).where(whereClause).orderBy(findingsTable.createdAt).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(findingsTable).where(whereClause),
  ]);

  return {
    query: request.q ?? "",
    filters,
    explanation,
    findings,
    total: Number(totalRows[0]?.total ?? 0),
  };
}
