# Benchmarks

Use this directory to clone real repositories and validate each milestone against them.

## Suggested workflow

1. Inspect the catalog with `npm run benchmark:list`
2. Clone one or more target repositories with `npm run benchmark:clone -- <name> ...`
3. Clone targets land in `benchmarks/repos/<name>`
4. Run `npm run onboard -- benchmarks/repos/<name>`
5. Inspect the generated `ONBOARDING.md`
6. Add or tighten tests when the real repo exposes a gap

## Initial catalog

- `axios` - normal JavaScript/TypeScript benchmark
- `poetry` - bigger Python benchmark
- `glow` - normal Go benchmark
- `gitea` - bigger Go benchmark
- `log` - normal Rust benchmark
- `tokio` - bigger Rust benchmark
- `express` - normal JavaScript benchmark
- `nest` - bigger TypeScript benchmark
- `slim` - normal PHP benchmark
- `laravel-framework` - bigger PHP benchmark

## Notes

- The catalog can include future-language repos before the parser support is finished
- Repos in `benchmarks/repos/` are ignored intentionally so we can clone real projects without bloating this repo
- Use at least one normal repo and one bigger repo before calling a milestone done

## Manual workflow

If you want to clone one by hand:

```bash
git clone --depth 1 https://github.com/axios/axios.git benchmarks/repos/axios
```

Then run:

```bash
npm run onboard -- benchmarks/repos/axios
```
