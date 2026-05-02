import Anthropic from "@anthropic-ai/sdk";

import type { SynthesisExecutor } from "./synthesis.js";
import { computeAnthropicCost } from "./cost.js";

import type { CostModelKey } from "./cost.js";

export interface AnthropicExecutorOptions {
  model: CostModelKey;
  apiKey: string;
  maxTokens?: number;
}

interface UsageShape {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function extractJsonFromLlmResponse(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

export function createAnthropicExecutor(options: AnthropicExecutorOptions): SynthesisExecutor {
  const client = new Anthropic({ apiKey: options.apiKey });
  const maxTokens = options.maxTokens ?? 4096;

  const executor: SynthesisExecutor = {
    model: options.model,
    async execute(prompt: string): Promise<string> {
      const splitMarker = "Structured context:";
      const splitIndex = prompt.indexOf(splitMarker);

      const content =
        splitIndex >= 0
          ? [
              { type: "text" as const, text: prompt.slice(0, splitIndex + splitMarker.length) },
              {
                type: "text" as const,
                text: prompt.slice(splitIndex + splitMarker.length),
                cache_control: { type: "ephemeral" as const }
              }
            ]
          : [{ type: "text" as const, text: prompt }];

      const response = await client.messages.create({
        model: options.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }]
      });

      const usage = response.usage;
      executor.usage = usage;
      const cost = computeAnthropicCost(options.model, usage);
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheCreate = usage.cache_creation_input_tokens ?? 0;

      process.stderr.write(
        `Anthropic ${options.model}: input=${usage.input_tokens} cache_read=${cacheRead} cache_create=${cacheCreate} output=${usage.output_tokens} cost=$${cost.toFixed(4)}\n`
      );

      const text = response.content
        .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("");

      return extractJsonFromLlmResponse(text);
    }
  };

  return executor;
}
