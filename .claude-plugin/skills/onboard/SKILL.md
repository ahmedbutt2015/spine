# /onboard

Use this skill from a repository root to generate an onboarding tour for an unfamiliar codebase.

## Current workflow

1. Run the deterministic scanner to detect repo shape and entry points.
2. Write `ONBOARDING.md` into the target repo root.
3. Use the output as the substrate for the upcoming verified spine walk and Mermaid diagram pass.

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

1. Shallow import and call walk from each entry point
2. Verified edge retention between the top 5-7 spine files
3. Mermaid validation plus `mermaid.live` URL generation
4. LLM synthesis over verified structure only
