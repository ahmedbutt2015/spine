# /onboard

Use this skill from a repository root to generate an onboarding tour for an unfamiliar codebase.

## Current workflow

1. Run the deterministic scanner to detect repo shape and entry points.
2. Extract a verified spine from supported local language relationships.
3. Generate and validate a Mermaid diagram from the verified spine.
4. Cluster the remaining files into heuristic subsystems.
5. Build a synthesis prompt that only contains verified structure and short code signatures.
6. Write `ONBOARDING.md` into the target repo root.

## Local command

```bash
npm run onboard -- .
```

Optional prompt export:

```bash
npm run onboard -- . --prompt-out .onboard-prompt.txt
```

Optional external synthesis command:

```bash
npm run onboard -- . --synthesis-command "your-command-here"
```

## Product contract

- Repo brand: `spine`
- User-facing Claude Code command: `/onboard`
- Diagram rule: verified edges only, never guessed
- Output target: `ONBOARDING.md`

## Next implementation targets

1. Better subsystem heuristics for very large repos
2. Stronger reading-order explanations
3. Snapshot coverage across more real repos
4. Public launch polish
