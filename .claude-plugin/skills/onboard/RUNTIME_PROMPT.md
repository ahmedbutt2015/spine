# Runtime Prompt Contract

`/onboard` now builds a synthesis prompt dynamically from verified repo data.

## Claude Code Skill Flow

When invoked as `/onboard` in Claude Code:

1. `spine` runs with `--prompt-out .onboard-prompt.txt` to write the synthesis prompt
2. Claude processes the prompt from `.onboard-prompt.txt` and writes JSON response to `.onboard-response.json`
3. `spine` runs again with `--synthesis-input .onboard-response.json` to generate `ONBOARDING.md`

## Hard rules

- Only verified files, edges, and subsystem summaries may be used.
- The model may not invent architecture edges.
- The model may not introduce file paths that are not present in the provided context.
- The Mermaid diagram is already verified and may not be edited by the model.
- The model must return JSON only for the synthesis layer.

## Prompt contents

- Repo detection summary
- Entry points
- Verified spine nodes and edges
- Validated Mermaid diagram metadata
- Heuristic subsystem clusters
- README excerpt
- Key config excerpts
- Short signature-only excerpts from spine files

## Output shape

The synthesis layer returns JSON with:

- `tlDr`
- `mentalModel`
- `readingOrder`
- `subsystems`
- `gotchas`
- `estimatedReadTime`

If the JSON is invalid or references unknown files, `spine` falls back to deterministic synthesis.

