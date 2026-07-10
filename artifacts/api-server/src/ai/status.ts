/**
 * AI subsystem status — surfaced in the UI so users always know whether
 * classification is running offline (Local) or against a cloud provider,
 * and whether cloud AI is enabled at all.
 *
 * Cloud AI is disabled by default: it only activates when an operator sets
 * OPENAI_API_KEY or EMBEDDINGS_API_KEY. No API key is ever hardcoded, and no
 * file content is sent anywhere by this layer.
 */

import type { AIStatus } from "./types.js";
import {
  activeProviderName,
  lastAIError,
  lastClassificationDurationMs,
  providerAvailability,
} from "./classifier.js";

export interface AISubsystemStatus {
  status: AIStatus;
  provider: string;
  cloudEnabled: boolean;
  /** Availability of every registered provider, keyed by provider id (e.g. "local", "openai", "embeddings"). */
  providerAvailability: Record<string, boolean>;
  /** Message from the most recent provider failure, or null if none has occurred since startup. */
  lastError: string | null;
  /** Duration in milliseconds of the most recent classification call, or null if none has run yet. */
  lastClassificationDurationMs: number | null;
}

export function getAIStatus(): AISubsystemStatus {
  const provider = activeProviderName();
  const cloudEnabled = Boolean(
    (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0) ||
    (process.env.EMBEDDINGS_API_KEY && process.env.EMBEDDINGS_API_KEY.length > 0)
  );

  const status: AIStatus = provider === "local-rule" ? "local" : "cloud";

  return {
    status,
    provider,
    cloudEnabled,
    providerAvailability: providerAvailability(),
    lastError: lastAIError(),
    lastClassificationDurationMs: lastClassificationDurationMs(),
  };
}
