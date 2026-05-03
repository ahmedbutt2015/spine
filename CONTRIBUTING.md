# Contributing to spine

Thanks for taking the time to contribute to `spine`.

The most helpful contributions right now are:

- testing `spine` on real repositories
- reporting incorrect entry points, bad reading order, or confusing output
- adding or improving benchmarks
- fixing bugs in parsing, graph building, or onboarding generation
- improving docs and onboarding UX

## Local setup

`spine` requires Node.js 20 or newer.

Install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build
```

Run checks:

```bash
npm run check
npm run test
```

## Try the CLI locally

Run the full onboarding flow:

```bash
npm run onboard -- .
```

Run the deterministic map-only flow:

```bash
npm run map -- .
```

## Help test spine on a real repo

If you are testing `spine`, the most useful feedback includes:

- the repository name or repo type
- the command you ran
- whether the detected entry points were correct
- whether the reading order felt useful
- whether the architecture diagram matched reality
- what was confusing, incomplete, or incorrect

If the generated output is shareable, include the resulting `ONBOARDING.md` or Mermaid diagram in your issue.

## Pull requests

Before opening a PR:

- run `npm run check`
- run `npm run test`
- make sure the change is scoped and explained clearly

In your PR description, include:

- what changed
- why it changed
- how you tested it
- any tradeoffs or known gaps

## Good first contributions

Good starter contributions include:

- improving docs
- adding benchmark coverage
- tightening language detection or entry-point detection
- fixing output clarity issues
- improving error messages
