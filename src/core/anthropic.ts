import Anthropic from "@anthropic-ai/sdk";

import type { SynthesisExecutor } from "./synthesis.js";

export interface AnthropicExecutorOptions {
  model: string;
  apiKey: string;
  maxTokens?: number;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 0.8, outputPerMillion: 4 }
};

const DEFAULT_PRICING: ModelPricing = PRICING["claude-sonnet-4-6"];

interface UsageShape {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function computeAnthropicCost(model: string, usage: UsageShape): number {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  const baseInput = (usage.input_tokens / 1_000_000) * pricing.inputPerMillion;
  const cacheCreate =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * pricing.inputPerMillion * 1.25;
  const cacheRead =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * pricing.inputPerMillion * 0.1;
  const output = (usage.output_tokens / 1_000_000) * pricing.outputPerMillion;
  return baseInput + cacheCreate + cacheRead + output;
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

  return {
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
}
