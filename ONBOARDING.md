# Onboarding tour: spine

## TL;DR
This repository looks like a cli codebase built primarily in typescript. The most likely starting points are `src/cli.ts`, `src/index.ts`. This pass is deterministic and now includes first-pass TS/JS spine extraction; diagram generation and broader multi-language tracing come next.

## Architecture map
Verified TS/JS spine nodes: `src/core/analyze.ts`, `src/formatters/onboarding.ts`, `src/core/detect.ts`, `src/core/entries.ts`, `src/core/spine.ts`, `src/types.ts`, `src/cli.ts`. Retained 10 verified edge(s) from static imports only. Diagram generation is the next step, but the node and edge set is now grounded in real source relationships.

## Mental model
Treat the command surface as the product. Follow the bin entry, then the argument parsing, then the core execution path.

## Reading order
- `src/core/analyze.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/formatters/onboarding.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/core/detect.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/core/entries.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/core/spine.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/types.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/cli.ts` - Read this early because it either starts the program or defines a key project contract.
- `src/index.ts` - Read this early because it either starts the program or defines a key project contract.
- `README.md` - Read this early because it either starts the program or defines a key project contract.
- `package.json` - Read this early because it either starts the program or defines a key project contract.
- `tsconfig.json` - Read this early because it either starts the program or defines a key project contract.

## Entry points found
- src/cli.ts - Declared as package.json bin.
- src/index.ts - Conventional TypeScript module entry.

## Subsystems
- Not clustered yet. Directory-based subsystem grouping lands in the next stage.

## Gotchas
- Detected CLI bin entry.

## Estimated read time
10-20 minutes for the current deterministic scan, with deeper subsystem synthesis still pending.
