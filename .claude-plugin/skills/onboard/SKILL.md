# /onboard

Use this skill from a repository root to generate an onboarding tour for an unfamiliar codebase.

## Current workflow

1. Run the deterministic scanner to detect repo shape and entry points.
2. Extract a verified spine from supported local language relationships.
3. Generate and validate a Mermaid diagram from the verified spine.
4. Write `ONBOARDING.md` into the target repo root.

## Local command

```bash
npm run onboard -- .
```

## Product contract

- Repo brand: `spine`
- User-facing Claude Code command: `/onboard`
- Diagram rule: verified edges only, never guessed
- Output target: `ONBOARDING.md`

## Next implementation targets

1. Subsystem clustering
2. Better reading-order heuristics
3. LLM synthesis over verified structure only
4. Snapshot coverage across more real repos
