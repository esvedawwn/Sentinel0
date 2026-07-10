/**
 * Sensitive-content detection over extracted text. Purely local/heuristic —
 * regex + keyword based, no network calls. Used to flag extracted text so
 * the UI can warn before showing/summarizing it; it never blocks extraction
 * itself, and never deletes or redacts the underlying file.
 */

import type { SensitiveCategory } from "@workspace/db";

const PATTERNS: Array<{ category: SensitiveCategory; pattern: RegExp }> = [
  { category: "legal", pattern: /\b(agreement|contract|plaintiff|defendant|whereas|indemnif\w*|non-disclosure|nda)\b/i },
  { category: "banking", pattern: /\b(routing number|account number|iban|swift code|bank statement)\b/i },
  { category: "banking", pattern: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/ },
  { category: "medical", pattern: /\b(diagnosis|prescription|patient|physician|medical record|hipaa)\b/i },
  { category: "identity", pattern: /\b(\d{3}-\d{2}-\d{4})\b/ },
  { category: "identity", pattern: /\b(passport number|social security|ssn|driver'?s license)\b/i },
  { category: "api_key", pattern: /\b(sk-[a-zA-Z0-9]{20,}|api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,})/i },
  { category: "password", pattern: /\b(password|passwd|pwd)\s*[:=]\s*\S+/i },
  { category: "private_key", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

export function detectSensitiveCategories(text: string): SensitiveCategory[] {
  const found = new Set<SensitiveCategory>();
  for (const { category, pattern } of PATTERNS) {
    if (pattern.test(text)) found.add(category);
  }
  return [...found];
}
