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
  | "Tax"
  | "Receipts"
  | "Invoices"
  | "Design"
  | "Branding"
  | "Web Development"
  | "Photography"
  | "Video"
  | "Audio"
  | "Renovation"
  | "Property"
  | "Medical"
  | "Personal Documents"
  | "Identity Documents"
  | "Business"
  | "Software"
  | "Installers"
  | "Archives"
  | "Screenshots"
  | "Temporary Files"
  | "Lock Files"
  | "Duplicate Candidates"
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
  /** Filenames of sibling entries in the same directory, when available. */
  neighbouringFilenames?: string[];
}

/**
 * A semantic tag attached to a file.
 * Tags are freeform labels used for search and future ML training.
 */
export interface AISemanticTag {
  label: string;
  /** Provider confidence for this specific tag (0–1). */
  score: number;
  /** Where the tag came from (e.g. "filename", "path", "extension", "finding-type"). */
  source: string;
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
  /** Whether the suggested action, once confirmed, could be undone. */
  reversible: boolean;
  /** Always true today — every AI action must be reviewed before it runs. */
  requiresConfirmation: boolean;
}

/** Classification result returned by every AIProvider. */
export interface AIClassificationResult {
  /** High-level category. */
  category: AICategory;
  /** Optional finer-grained classification within the category. */
  subcategory: string | null;
  /** Confidence 0–100. */
  confidence: number;
  /** Human-readable explanation of why this category was chosen. */
  explanation: string;
  /** Semantic tags (flat string list for storage). */
  tags: string[];
  /** Suggested folder/location for organisation (display-only; never applied automatically). */
  suggestedDestination: string | null;
  /** Short human-readable description of the suggested action. */
  suggestedAction: string;
  /** Non-destructive recommendation. */
  recommendation: AIRecommendation;
  /** Identifies which provider produced this result. */
  provider: string;
}

/**
 * Status of the AI subsystem, surfaced in the UI so users always know
 * whether classification ran offline or against a cloud provider.
 */
export type AIStatus = "local" | "cloud" | "offline" | "analysing" | "failed" | "consent_required";

/**
 * Provider interface.
 * Implement this to add a new classification back-end.
 */
export interface AIProvider {
  /** Unique provider identifier stored with each result. */
  readonly name: string;
  /** Whether this provider runs locally (no network) or against the cloud. */
  readonly kind: "local" | "cloud";
  /**
   * Classify a file and return a result.
   * Must never perform any filesystem writes.
   */
  classify(input: AIClassificationInput): Promise<AIClassificationResult>;
  /** Returns true when the provider can accept requests (e.g. API key present). */
  isAvailable(): boolean;
}
