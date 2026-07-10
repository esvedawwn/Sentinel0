export type {
  AICategory,
  AIClassificationInput,
  AIClassificationResult,
  AIRecommendation,
  AISemanticTag,
  AIProvider,
  AIStatus,
} from "./types.js";

export {
  classifyWithAI,
  activeProviderName,
  resetProvider,
  lastAIError,
  lastClassificationDurationMs,
  providerAvailability,
} from "./classifier.js";
export { LocalRuleProvider, classifyLocalRule } from "./providers/localRule.js";
export { OpenAIProvider } from "./providers/openai.js";
export { EmbeddingsProvider } from "./providers/embeddings.js";
export { interpretSearchQuery } from "./search.js";
export type { SearchInterpretation } from "./search.js";
export { getAIStatus } from "./status.js";
export type { AISubsystemStatus } from "./status.js";
