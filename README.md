# spine

`spine` is the repo behind the `/onboard` Claude Code command: a codebase onboarding tool that produces an ordered reading tour, a mental model, gotchas, and a small verified architecture diagram.

## Product shape

- Repo name: `spine`
- Claude Code command: `/onboard`
- Distribution v1: Claude Code skill in `.claude-plugin/skills/onboard/`
- Distribution v2: standalone CLI exposed as `onboard`

## Current status

The first implementation slice is in place:

- Detect repo shape and dominant languages
- Find likely entry points across TS/JS, Python, Go, and Rust
- Generate a starter `ONBOARDING.md` with a deterministic reading order
- Package the foundation for the future verified spine walk and Mermaid diagram

## Development

```bash
npm install
npm run test
npm run onboard -- .
```

That writes `ONBOARDING.md` into the target repo root.

## MVP roadmap

1. Deterministic repo scan
2. Verified spine extraction and edge retention
3. Mermaid validation plus `mermaid.live` URL generation
4. LLM synthesis over the verified structure
5. Fixture snapshots for famous repos

