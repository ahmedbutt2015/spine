export const MODEL_PRICING = {
  "claude-opus-4-7": {
    label: "Claude Opus 4.7",
    inputPerMillion: 15,
    outputPerMillion: 75
  },
  "claude-sonnet-4-6": {
    label: "Claude Sonnet 4.6",
    inputPerMillion: 3,
    outputPerMillion: 15
  },
  "claude-haiku-4-5-20251001": {
    label: "Claude Haiku 4.5",
    inputPerMillion: 0.8,
    outputPerMillion: 4
  }
} as const;

export type CostModelKey = keyof typeof MODEL_PRICING;

export const DEFAULT_COST_MODEL: CostModelKey = "claude-sonnet-4-6";

const MODEL_ALIASES: Record<string, CostModelKey> = {
  "opus-4.7": "claude-opus-4-7",
  "opus": "claude-opus-4-7",
  "claude-opus-4-7": "claude-opus-4-7",
  "sonnet-4.6": "claude-sonnet-4-6",
  "sonnet": "claude-sonnet-4-6",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "haiku-4.5": "claude-haiku-4-5-20251001",
  "haiku": "claude-haiku-4-5-20251001",
  "claude-haiku-4-5-20251001": "claude-haiku-4-5-20251001"
};

export function resolveCostModel(modelName?: string): CostModelKey {
  if (!modelName) {
    return DEFAULT_COST_MODEL;
  }

  const normalized = modelName.toLowerCase();
  return MODEL_ALIASES[normalized] ?? DEFAULT_COST_MODEL;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5));
}

export function estimateOutputTokens(inputTokens: number): number {
  return Math.max(300, Math.ceil(inputTokens * 0.25));
}

export function computeAnthropicCost(model: CostModelKey, usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): number {
  const pricing = MODEL_PRICING[model];
  const baseInput = (usage.input_tokens / 1_000_000) * pricing.inputPerMillion;
  const cacheCreate = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * pricing.inputPerMillion * 1.25;
  const cacheRead = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * pricing.inputPerMillion * 0.1;
  const output = (usage.output_tokens / 1_000_000) * pricing.outputPerMillion;
  return baseInput + cacheCreate + cacheRead + output;
}

export function formatCostEstimate(model: CostModelKey, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_PRICING[model];
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return {
    modelLabel: pricing.label,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}
