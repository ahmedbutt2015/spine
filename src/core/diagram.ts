import pako from "pako";
import mermaid from "mermaid";

import type { ArchitectureDiagram, DiagramNodeRef, SpineAnalysis } from "../types.js";

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createMermaidLiveUrl(code: string): string {
  const payload = {
    code,
    mermaid: {
      theme: "default"
    },
    autoSync: true,
    updateDiagram: false
  };

  const compressed = pako.deflate(JSON.stringify(payload), { level: 9 });
  return `https://mermaid.live/view#pako:${toBase64Url(compressed)}`;
}

function slugFromPath(filePath: string): string {
  const cleaned = filePath
    .replace(/\.[^.]+$/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const base = cleaned.length > 0 ? cleaned : "node";
  return /^[A-Za-z_]/.test(base) ? base : `n_${base}`;
}

function buildPrimaryNodeRefs(nodes: string[]): DiagramNodeRef[] {
  const usedIds = new Set<string>();

  return nodes.map((filePath, index) => {
    let candidate = slugFromPath(filePath);
    while (usedIds.has(candidate)) {
      candidate = `${candidate}_${index + 1}`;
    }
    usedIds.add(candidate);
    return { id: candidate, path: filePath };
  });
}

function buildFallbackNodeRefs(nodes: string[]): DiagramNodeRef[] {
  return nodes.map((filePath, index) => ({
    id: `N${index + 1}`,
    path: filePath
  }));
}

function renderMermaidCode(nodeRefs: DiagramNodeRef[], spine: SpineAnalysis): string {
  const nodeLookup = new Map(nodeRefs.map((nodeRef) => [nodeRef.path, nodeRef.id]));
  const lines = ["flowchart LR"];

  for (const nodeRef of nodeRefs) {
    lines.push(`  ${nodeRef.id}`);
  }

  for (const edge of spine.edges) {
    const from = nodeLookup.get(edge.from);
    const to = nodeLookup.get(edge.to);
    if (from && to) {
      lines.push(`  ${from} --> ${to}`);
    }
  }

  return lines.join("\n");
}

async function validateMermaid(code: string): Promise<boolean> {
  await mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
  await mermaid.parse(code, { suppressErrors: false });
  return true;
}

async function buildValidatedDiagram(
  nodeRefs: DiagramNodeRef[],
  spine: SpineAnalysis
): Promise<ArchitectureDiagram | null> {
  const code = renderMermaidCode(nodeRefs, spine);
  const isValid = await validateMermaid(code);

  if (!isValid) {
    return null;
  }

  return {
    code,
    mermaidLiveUrl: createMermaidLiveUrl(code),
    nodes: nodeRefs
  };
}

export async function generateArchitectureDiagram(
  spine: SpineAnalysis
): Promise<ArchitectureDiagram | null> {
  if (spine.nodes.length === 0) {
    return null;
  }

  const primaryDiagram = await buildValidatedDiagram(buildPrimaryNodeRefs(spine.nodes), spine);
  if (primaryDiagram) {
    return primaryDiagram;
  }

  return buildValidatedDiagram(buildFallbackNodeRefs(spine.nodes), spine);
}
