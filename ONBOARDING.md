# Onboarding tour: spine

## TL;DR
This repository is a cli built primarily in typescript. The verified spine currently runs through `src/core/analyze.ts`, `src/core/repoContext.ts`, `src/core/synthesis.ts`. The architecture diagram is derived from verified static-analysis edges only.

## Architecture map
```mermaid
flowchart LR
  src_core_analyze
  src_core_repoContext
  src_core_synthesis
  src_formatters_onboarding
  src_core_detect
  src_core_diagram
  src_core_entries
  src_core_analyze --> src_core_detect
  src_core_analyze --> src_core_diagram
  src_core_analyze --> src_core_entries
```

View / edit on [mermaid.live](https://mermaid.live/view#pako:eNp9kLEOwjAMRH-l8tz-QAcWGJlgRapM4rSRmhg5rqBU_XeKgCFSxPp0vvPdAoYtQQtu5LsZULQ6ni6xqpKYzrBQhxHH-UkZE7rxnqPSQzOe5qgDJZ9-1LEEVCVJHccro1gf--zEkpLJXazHXjBkjKKKp1T6rGqa3V-_sq4QUhR-k6GGQFsZb6FdYGsZ3qtZcjiNCmsNOCmf52igVZmohulmUenwiYHW4ZhofQH3tIg7)

Legend:
- `src_core_analyze` = `src/core/analyze.ts`
- `src_core_repoContext` = `src/core/repoContext.ts`
- `src_core_synthesis` = `src/core/synthesis.ts`
- `src_formatters_onboarding` = `src/formatters/onboarding.ts`
- `src_core_detect` = `src/core/detect.ts`
- `src_core_diagram` = `src/core/diagram.ts`
- `src_core_entries` = `src/core/entries.ts`

Every edge above is verified by static analysis. Edges the tool couldn't verify are omitted, not guessed.

## Mental model
Treat the command surface as the product: startup, argument flow, and the first handoff into core logic explain most of the system.

## Reading order
- `src/core/analyze.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/core/repoContext.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/core/synthesis.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/formatters/onboarding.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/core/detect.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/core/diagram.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/core/entries.ts` - This file sits on the verified architecture spine and explains the main runtime handoff.
- `src/cli.ts` - This is a detected entry point, so it shows how execution begins.
- `src/index.ts` - This is a detected entry point, so it shows how execution begins.
- `README.md` - Defines a key project contract or context file.
- `package.json` - Defines a key project contract or context file.
- `tsconfig.json` - Defines a key project contract or context file.

## Entry points found
- src/cli.ts - Declared as package.json bin.
- src/index.ts - Conventional TypeScript module entry.

## Subsystems
### Tests
What it does: Test coverage and verification logic.
Where it lives: `tests/**`
Entry point: `tests/analyze.test.ts`
Skip unless: Skip unless you need to understand or extend coverage.

### Core
What it does: Core orchestration and shared runtime behavior.
Where it lives: `src/**`
Entry point: `src/core/anthropic.ts`
Skip unless: Skip unless you need the central control flow or shared abstractions.

### Benchmarks
What it does: Files grouped around the benchmarks part of the codebase.
Where it lives: `benchmarks/**`
Entry point: `src/benchmarks/catalog.ts`
Skip unless: Skip unless your task touches the benchmarks area directly.

## Gotchas
- Detected CLI bin entry.
- The architecture diagram is intentionally incomplete where static analysis could not verify an edge.

## Estimated read time
15 minutes for the spine, 1 hour for fuller coverage.
