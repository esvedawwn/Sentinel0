/**
 * Heuristic entity extraction over extracted document text. Regex-based
 * only — no AI call — so it never requires network access or consent.
 * Covers: people (naive capitalized-name heuristic), organizations (Inc/LLC
 * suffixes), dates, invoice numbers, case references, and dollar amounts.
 */

import type { EntityType } from "@workspace/db";

export interface ExtractedEntity {
  type: EntityType;
  value: string;
}

const DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/g;
const INVOICE_PATTERN = /\b(?:invoice|inv)[\s#:-]*([A-Z0-9-]{4,})\b/gi;
const CASE_REFERENCE_PATTERN = /\b(?:case|matter|docket)[\s#:-]*(?:no\.?)?\s*([A-Z0-9-]{4,})\b/gi;
const AMOUNT_PATTERN = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g;
const ORG_PATTERN = /\b([A-Z][A-Za-z&.,'-]*(?:\s[A-Z][A-Za-z&.,'-]*){0,3}\s(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co)\.?)\b/g;
const PERSON_PATTERN = /\b([A-Z][a-z]+\s[A-Z][a-z]+)\b/g;

function collect(pattern: RegExp, text: string, group = 0): string[] {
  const values = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const value = match[group]?.trim();
    if (value) values.add(value);
  }
  return [...values];
}

export function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (const value of collect(DATE_PATTERN, text)) entities.push({ type: "date", value });
  for (const value of collect(INVOICE_PATTERN, text, 1)) entities.push({ type: "invoice_number", value });
  for (const value of collect(CASE_REFERENCE_PATTERN, text, 1)) entities.push({ type: "case_reference", value });
  for (const value of collect(AMOUNT_PATTERN, text)) entities.push({ type: "amount", value });
  for (const value of collect(ORG_PATTERN, text)) entities.push({ type: "organization", value });

  const orgValues = new Set(entities.filter((e) => e.type === "organization").map((e) => e.value));
  for (const value of collect(PERSON_PATTERN, text)) {
    if ([...orgValues].some((org) => org.includes(value))) continue;
    entities.push({ type: "person", value });
  }

  return entities;
}
