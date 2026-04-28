# Benchmarks

Use this directory to clone real repositories and validate each milestone against them.

## Suggested workflow

1. Clone a target repository into `benchmarks/repos/<name>`
2. Run `npm run onboard -- benchmarks/repos/<name>`
3. Inspect the generated `ONBOARDING.md`
4. Add or tighten tests when the real repo exposes a gap

## Notes

- Keep cloned repos out of git
- Prefer one benchmark repo per codebase shape we care about
- Use this folder as a reality check for every milestone before we call it done

