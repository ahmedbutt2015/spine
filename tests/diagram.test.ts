import path from "node:path";

import mermaid from "mermaid";
import pako from "pako";
import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";
import { synthesizeTour } from "../src/core/synthesis.js";
import { renderOnboardingMarkdown } from "../src/formatters/onboarding.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

describe("generateArchitectureDiagram", () => {
  it("generates a valid Mermaid diagram from the verified spine", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-ts"));

    expect(result.diagram).not.toBeNull();
    const diagram = result.diagram!;

    await mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
    const parsed = await mermaid.parse(diagram.code, { suppressErrors: false });
    expect(parsed).not.toBe(false);

    const nodeLookup = new Map(diagram.nodes.map((nodeRef) => [nodeRef.id, nodeRef.path]));
    const renderedEdges = diagram.code
      .split("\n")
      .filter((line) => line.includes("-->"))
      .map((line) => {
        const match = line.trim().match(/^([A-Za-z0-9_]+)\s+-->\s+([A-Za-z0-9_]+)$/);
        expect(match).not.toBeNull();
        return {
          from: nodeLookup.get(match![1]),
          to: nodeLookup.get(match![2])
        };
      });

    expect(renderedEdges).toEqual(
      result.spine.edges.map((edge) => ({
        from: edge.from,
        to: edge.to
      }))
    );
  });

  it("encodes a mermaid.live URL that round-trips to the same code", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-go"));

    expect(result.diagram).not.toBeNull();
    const diagram = result.diagram!;
    const payload = diagram.mermaidLiveUrl.split("#pako:")[1];
    expect(payload).toBeTruthy();

    const inflated = pako.inflate(fromBase64Url(payload), { to: "string" });
    const parsedPayload = JSON.parse(inflated) as { code: string };

    expect(parsedPayload.code).toBe(diagram.code);
  });

  it("renders the validated diagram and link into ONBOARDING markdown", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-python"));
    const synthesis = await synthesizeTour(path.join(fixturesRoot, "spine-python"), result);
    const markdown = renderOnboardingMarkdown(result, synthesis);

    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("View / edit on [mermaid.live](");
    expect(markdown).toContain("Every edge above is verified by static analysis.");
  });
});
