# spine Project Plan

This document turns the original `/onboard` product brief into a working execution plan for `spine`.

## Product identity

- Repo name: `spine`
- Claude Code command: `/onboard`
- Later CLI command: `onboard`
- Core promise: generate a personalized reading tour of an unfamiliar codebase, plus one small architecture diagram built only from verified static-analysis edges

## Product summary

Run `/onboard` once at a repository root.

The tool should produce:

- An `ONBOARDING.md` file with an ordered reading list
- A short mental model of how the codebase works
- A list of gotchas and unusual patterns
- A single 5-7 node architecture diagram of the codebase spine
- A `mermaid.live` link that can be shared publicly

The important credibility rule is simple:

- No imagined architecture edges
- Every diagram edge must come from real static analysis
- If an edge cannot be verified, it must be omitted

## The ideal demo

```bash
$ cd postgres
$ claude /onboard

→ Detected: C, ~1.5M LOC, monorepo-style internal structure
→ Mapping entry points... done (12 found)
→ Tracing the spine... done (7 core files)
→ Verifying edges... 14/19 retained, 5 dropped (unverified)
→ Clustering subsystems... done

✓ Wrote ONBOARDING.md
✓ Architecture diagram: https://mermaid.live/view#pako:...
```

## What the product must do

### Output contract

`ONBOARDING.md` should include:

- `# Onboarding tour: <repo name>`
- `## TL;DR`
- `## Architecture map`
- Mermaid diagram when valid
- `mermaid.live` link
- Verified-edge disclaimer
- `## Mental model`
- `## Reading order`
- `## Subsystems`
- `## Gotchas`
- `## Estimated read time`

### Hard rules

- Verified edges only
- Diagram limited to 5-7 nodes
- One diagram per tour
- Mermaid must parse before it is written
- If Mermaid fails twice, omit the diagram gracefully
- The LLM may summarize and select from verified edges, but it may not invent any

## Technical direction

- Language: TypeScript
- Runtime: Node 20+
- Modules: NodeNext
- Tests: Vitest
- Mermaid parsing: `@mermaid-js/parser`
- Mermaid link encoding: `pako`
- Distribution v1: Claude Code skill
- Distribution v2: standalone CLI
- Repository layout: single package

## MVP scope

### In scope for v1

- TS/JS, Python, Rust, Go detection
- Heuristic entry-point detection
- Shallow spine tracing
- Verified edge set generation
- Single-file `ONBOARDING.md` output
- Mermaid diagram with 5-7 nodes
- Mermaid parse validation with one retry
- `mermaid.live` link generation
- Claude Code skill packaging
- Fixture-based tests

### Explicitly out for v1

- Hosted product
- Web UI
- Multi-diagram output
- Interactive Q&A
- Diff mode
- Persistence
- Languages beyond the first four
- Personalization beyond a single generated tour

## Status snapshot

### Done now

- [x] Created GitHub repo `ahmedbutt2015/spine`
- [x] Chosen branding: repo `spine`, command `/onboard`
- [x] Set up TypeScript single-package project
- [x] Added Vitest test harness
- [x] Added starter Claude skill scaffold
- [x] Implemented deterministic project-shape detection
- [x] Implemented multi-language entry-point detection
- [x] Added initial fixture coverage for TS/JS, Python, Go, Rust, and monorepo cases
- [x] Added a starter `ONBOARDING.md` generator
- [x] Added a TS/JS verified import graph and first-pass spine extraction
- [x] Added a `benchmarks/` workspace for real-repo validation
- [x] Added a benchmark catalog for JS, TS, Python, Go, Rust, and PHP repos
- [x] Added first-pass Python verified import tracing
- [x] Added coverage for Python `src/` layout imports discovered during benchmark testing
- [x] Verified the current scaffold with `npm run check`, `npm run test`, and `npm run onboard -- .`

### In progress conceptually

- [x] Spine tracing from TS/JS entry points
- [x] Verified TS/JS import-edge extraction
- [x] Spine tracing from Python entry points
- [x] Verified Python import-edge extraction
- [ ] Spine tracing from Go and Rust entry points
- [ ] Verified edge extraction for Go and Rust
- [ ] Subsystem clustering
- [ ] Final markdown contract
- [ ] Mermaid parse validation
- [ ] `mermaid.live` URL generation
- [ ] LLM synthesis constrained by verified data only

## Milestones

### Milestone 1: Foundation

Goal: make `/onboard` run deterministically and produce a useful starter output.

Status: complete

Checklist:

- [x] Repository scan
- [x] Language detection
- [x] Project-shape classification
- [x] Entry-point discovery
- [x] Starter markdown writer
- [x] Initial tests

### Milestone 2: Verified spine extraction

Goal: compute the real backbone of the codebase without any LLM inference.

Status: next up

Checklist:

- [x] Parse imports and requires for TS/JS
- [x] Parse imports for Python
- [ ] Parse module/file references for Go
- [ ] Parse module references for Rust
- [x] Walk outward from TS/JS and Python entry points at shallow depth
- [x] Score TS/JS and Python files by reach from entry points
- [x] Select the first 5-7 TS/JS and Python spine nodes
- [x] Build verified edges only between selected TS/JS and Python nodes
- [ ] Drop unresolved or speculative edges
- [ ] Add tests proving every retained edge exists in source

### Milestone 3: Diagram generation

Goal: turn the verified spine into a valid, shareable architecture diagram.

Status: not started

Checklist:

- [ ] Generate Mermaid from verified spine
- [ ] Enforce 5-7 node limit
- [ ] Validate with `@mermaid-js/parser`
- [ ] Retry generation once if invalid
- [ ] Omit diagram on repeated failure
- [ ] Encode `mermaid.live` URL with `pako`
- [ ] Add round-trip tests for the generated link

### Milestone 4: Subsystem and reading-tour quality

Goal: make the output feel genuinely useful for a developer opening a strange repo.

Status: not started

Checklist:

- [ ] Cluster non-spine files into subsystems
- [ ] Label clusters with heuristics
- [ ] Choose one file per subsystem as the read-first file
- [ ] Improve reading order beyond raw file existence
- [ ] Estimate read time based on output size and spine depth
- [ ] Expand fixture repos to cover more codebase shapes

### Milestone 5: LLM-constrained synthesis

Goal: let the LLM write clearly without letting it hallucinate architecture.

Status: not started

Checklist:

- [ ] Define the runtime prompt for `/onboard`
- [ ] Feed only verified structure plus small code excerpts
- [ ] Prevent the model from inventing edges
- [ ] Regenerate markdown if contract sections are missing
- [ ] Add snapshot tests for final `ONBOARDING.md`

### Milestone 6: Launch readiness

Goal: make the repo credible and easy to try.

Status: not started

Checklist:

- [ ] Improve README for public launch
- [ ] Add usage examples
- [ ] Add fixture snapshots for famous repos or close approximations
- [ ] Run on real open-source repos
- [ ] Capture 3 high-quality diagram examples
- [ ] Prepare launch assets and messaging

## What should happen next

The highest-value next step is Milestone 2.

Why:

- The verified spine is the product's technical moat
- The diagram depends on it
- The final LLM prompt depends on it
- Without verified edges, the product is still only a smart repo scanner

Recommended next implementation order:

1. Build the import/reference graph for TS/JS first
2. Add shallow traversal and scoring from entry points
3. Select the 5-7 node spine
4. Emit verified edge sets
5. Add diagram generation on top of that
6. Then bring in the LLM for prose synthesis

## Risks and product traps

- The diagram gets too big and turns into a map instead of a spine
- The LLM tries to be helpful and invents edges
- Framework-specific conventions hide the true entry point
- Fixture tests are too toy-sized and miss real repo shapes
- The reading order becomes generic instead of genuinely useful

## Definition of done for MVP

The MVP is done when:

- `/onboard` runs in a real repo root
- It writes a clean `ONBOARDING.md`
- The file includes a valid Mermaid diagram or gracefully omits it
- Every diagram edge is backed by verified static analysis
- Tests prove the edge-verification rule
- The output is good enough that a developer would actually follow the reading order

## Working checklist

Use this as the day-to-day implementation checklist.

- [x] Repo created
- [x] Baseline scaffold created
- [x] Deterministic detection implemented
- [x] Entry-point finder implemented
- [x] TS/JS spine tracer implemented
- [x] TS/JS verified edge builder implemented
- [x] Python spine tracer implemented
- [ ] Go spine tracer implemented
- [ ] Rust spine tracer implemented
- [ ] Subsystem clustering implemented
- [ ] Mermaid generator implemented
- [ ] Mermaid validator implemented
- [ ] `mermaid.live` encoder implemented
- [ ] Final markdown contract implemented
- [ ] Runtime prompt written
- [ ] Snapshot suite expanded
- [ ] Public launch polish completed
