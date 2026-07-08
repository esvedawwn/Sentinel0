/**
 * AI Intelligence Layer — Core Types
 *
 * Defines all interfaces for the AI classification pipeline.
 * Providers implement AIProvider; classifiers consume AIClassificationInput
 * and return AIClassificationResult.
 *
 * Safety contract:
 *   AI may only recommend actions — it never deletes, moves, renames, or
 *   modifies files. All destructive suggestions remain preview-only and
 *   require explicit user confirmation.
 */

export type AICategory =
  | "Legal"
  | "Banking"
  | "Design"
  | "Renovation"
  | "Medical"
  | "Personal Documents"
  | "Media"
  | "Software"
  | "Archives"
  | "Temporary / Junk"
  | "Unknown";

/** Input handed to a provider's classify() method. */
export interface AIClassificationInput {
  /** Full filesystem path. */
  path: string;
  /** Filename (with extension). */
  name: string;
  /** Lowercase file extension including the dot, e.g. ".pdf". Empty for folders. */
  extension: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Finding type from the scan engine (e.g. "installer", "archive", "zero_byte"). */
  findingType: string;
}

/**
 * A semantic tag attached to a file.
 * Tags are freeform labels used for search and future ML training.
 */
export interface AISemanticTag {
  label: string;
  /** Provider confidence for this specific tag (0–1). */
  score: number;
}

/**
 * A non-destructive recommended action.
 * The safe flag must be false for any action that would alter or remove data.
 */
export interface AIRecommendation {
  /** Suggested action. All actions are preview-only unless user confirms. */
  action: "delete" | "review" | "archive" | "keep" | "ignore";
  /** Human-readable justification. */
  reason: string;
  /**
   * If false, the action would modify or remove data and MUST require
   * explicit confirmation before execution. Never auto-execute unsafe actions.
   */
  safe: boolean;
}

/** Classification result returned by every AIProvider. */
export interface AIClassificationResult {
  /** High-level category. */
  category: AICategory;
  /** Confidence 0–100. */
  confidence: number;
  /** Human-readable explanation of why this category was chosen. */
  explanation: string;
  /** Semantic tags (flat string list for storage). */
  tags: string[];
  /** Non-destructive recommendation. */
  recommendation: AIRecommendation;
  /** Identifies which provider produced this result. */
  provider: string;
}

/**
 * Provider interface.
 * Implement this to add a new classification back-end.
 */
export interface AIProvider {
  /** Unique provider identifier stored with each result. */
  readonly name: string;
  /**
   * Classify a file and return a result.
   * Must never perform any filesystem writes.
   */
  classify(input: AIClassificationInput): Promise<AIClassificationResult>;
  /** Returns true when the provider can accept requests (e.g. API key present). */
  isAvailable(): boolean;
}
