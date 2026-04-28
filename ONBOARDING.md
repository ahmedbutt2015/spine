# Onboarding tour: spine

## TL;DR
This repository looks like a cli codebase built primarily in typescript. The most likely starting points are `src/cli.ts`, `src/index.ts`. This first pass is deterministic and only covers repo shape plus entry discovery; verified spine extraction and Mermaid generation come next.

## Architecture map
Diagram generation is not wired in yet for this slice. The next stage will trace the verified spine and only emit edges proven by static analysis.

## Mental model
Treat the command surface as the product. Follow the bin entry, then the argument parsing, then the core execution path.

## Reading order
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
10-20 minutes for the current deterministic scan, pending deeper spine extraction.
