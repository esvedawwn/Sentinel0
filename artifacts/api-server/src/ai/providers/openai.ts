/**
 * OpenAIProvider — Placeholder
 *
 * Future integration point for GPT-4o or GPT-4o-mini file classification.
 * Requires OPENAI_API_KEY environment variable.
 *
 * When implemented, this provider will:
 *   - Build a prompt from AIClassificationInput metadata (no file content)
 *   - Ask the model to return a structured JSON classification result
 *   - Validate the response with Zod
 *   - Cache results by (name, ext, sizeRange) to reduce API calls
 *
 * Safety: AI may only recommend actions. No file mutations are permitted.
 */

import type { AIClassificationInput, AIClassificationResult, AIProvider } from "../types.js";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  isAvailable(): boolean {
    return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
  }

  async classify(_input: AIClassificationInput): Promise<AIClassificationResult> {
    if (!this.isAvailable()) {
      throw new Error("OpenAIProvider: OPENAI_API_KEY is not set");
    }

    // TODO: implement when AI integration is enabled
    // Example request structure (do NOT hardcode the key):
    //
    // const response = await fetch("https://api.openai.com/v1/chat/completions", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     model: "gpt-4o-mini",
    //     response_format: { type: "json_object" },
    //     messages: [
    //       {
    //         role: "system",
    //         content: SYSTEM_PROMPT,
    //       },
    //       {
    //         role: "user",
    //         content: JSON.stringify({
    //           filename: input.name,
    //           extension: input.extension,
    //           pathSegments: input.path.split("/").slice(0, -1).slice(-5),
    //           sizeBytes: input.sizeBytes,
    //           findingType: input.findingType,
    //         }),
    //       },
    //     ],
    //   }),
    // });
    //
    // const data = await response.json();
    // return parseOpenAIResponse(data);

    throw new Error("OpenAIProvider: not yet implemented");
  }
}
