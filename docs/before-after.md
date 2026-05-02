# Before / After: spine onboarding

This document shows the difference between the manual onboarding experience and what `spine` delivers.

## Why this matters

Without a verified onboarding layer, a developer must:

- read the repo README and inspect a handful of files manually
- hunt for the actual runtime entry point and call graph
- infer architecture edges across the codebase
- validate whether the diagram is correct by eyeballing it

With `spine`, the developer gets a verified architecture diagram plus a guided reading tour in one run.

---

## Example 1: `axios`

### Before

A new engineer opening `axios` typically starts by reading:

- `README.md`
- `package.json`
- `src/index.ts`
- `lib/adapters/xhr.ts`
- `lib/core/Axios.ts`

Then they must infer where the public API meets the runtime request flow.

### After

`spine` produces a deterministic `ONBOARDING.md` and a validated Mermaid diagram with a `mermaid.live` link.

```bash
npm run onboard -- benchmarks/repos/axios
```

This gives a developer:

- a short TL;DR for the repo shape
- a mental model of the main runtime path
- an ordered reading list for the most important files
- a validated architecture diagram

---

## Example 2: `slim`

### Before

In a framework repo like `slim`, the onboarding path is even harder because the public surface and the runtime path are separated.

A manual onboarding attempt often involves:

- reading the README and framework overview
- locating the main app/bootstrap files
- tracing hooks and middleware initialization
- following the verified spine through the runtime path

### After

`spine` supplies the verified path automatically and surfaces the diagram before the full LLM tour.

```bash
npm run onboard -- benchmarks/repos/slim
```

That means the developer can verify the architecture first, then commit to the full `/onboard` tour.

---

## What `spine` adds

- `npm run onboard -- . --map-only` produces the Mermaid graph only
- `npm run onboard -- .` writes `ONBOARDING.md`
- `--cost-model` makes the preflight token estimate explicit
- the built-in pipeline is deterministic until synthesis is required

## Screenshot guidance

To complete this doc for launch, capture:

- the raw `README.md` and file tree for a repo before `spine`
- the generated `ONBOARDING.md` after running `spine`
- the rendered Mermaid diagram from `mermaid.live`
