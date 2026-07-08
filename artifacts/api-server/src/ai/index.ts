export type {
  AICategory,
  AIClassificationInput,
  AIClassificationResult,
  AIRecommendation,
  AISemanticTag,
  AIProvider,
} from "./types.js";

export { classifyWithAI, activeProviderName, resetProvider } from "./classifier.js";
export { LocalRuleProvider } from "./providers/localRule.js";
export { OpenAIProvider } from "./providers/openai.js";
export { EmbeddingsProvider } from "./providers/embeddings.js";
