import { describe, expect, it } from "vitest";

import { estimateOutputTokens, estimateTokens, formatCostEstimate, resolveCostModel } from "../src/core/cost.js";

describe("cost utilities", () => {
  it("estimates token count from text length", () => {
    expect(estimateTokens("a".repeat(35))).toBe(10);
    expect(estimateTokens("".padEnd(1))).toBe(1);
  });

  it("estimates output tokens from input tokens", () => {
    expect(estimateOutputTokens(1000)).toBe(300);
    expect(estimateOutputTokens(2000)).toBe(500);
  });

  it("resolves common model aliases", () => {
    expect(resolveCostModel("sonnet")).toBe("claude-sonnet-4-6");
    expect(resolveCostModel("opus-4.7")).toBe("claude-opus-4-7");
    expect(resolveCostModel("haiku-4.5")).toBe("claude-haiku-4-5-20251001");
    expect(resolveCostModel("unknown")).toBe("claude-sonnet-4-6");
  });

  it("formats cost estimate cleanly", () => {
    const estimate = formatCostEstimate("claude-sonnet-4-6", 1000, 500);
    expect(estimate.modelLabel).toBe("Claude Sonnet 4.6");
    expect(estimate.inputCost).toBeGreaterThan(0);
    expect(estimate.outputCost).toBeGreaterThan(0);
    expect(estimate.totalCost).toBeCloseTo(estimate.inputCost + estimate.outputCost, 8);
  });
});
