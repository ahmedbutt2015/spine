# Before / after: why spine is useful

This document is meant to help with launch messaging and demos.

## The simple story

Before `spine`, a developer opens an unfamiliar repo and has to guess:

- what file really matters first
- where the true entry path starts
- which architecture edges are real versus assumed

After `spine`, they get:

- a verified architecture map
- a reading order
- a short mental model
- subsystem summaries and gotchas

## Best launch example: axios

`axios` is the strongest first benchmark because it is familiar, compact, and easy to judge.

### Before

A new developer usually bounces between:

- `README.md`
- `package.json`
- `index.js`
- `lib/axios.js`
- `lib/core/Axios.js`

That often leads to a fuzzy model of how the public API actually reaches adapters, cancelation helpers, and core request flow.

### After

Run:

```bash
npm run onboard -- benchmarks/repos/axios
```

What `spine` gives back:

- a small Mermaid diagram with verified edges only
- a focused reading order instead of a broad file hunt
- a TL;DR that names the real spine files

The value is easy to explain in one line:

> `spine` shows you where to start, and it only draws the edges it can prove.

## Second example: Slim

`Slim` is a strong PHP example because it shows the tool is not only for TS/JS repos.

### Before

A developer has to infer routing, middleware, and application setup by manually traversing:

- `README.md`
- `composer.json`
- `Slim/App.php`
- a set of interfaces and middleware classes

### After

`spine` gives a verified path through the framework surface and highlights the files worth reading first.

## Recommended demo order

1. `axios` for the fastest launch demo
2. `glow` for a clean Go CLI example
3. `poetry` for a larger Python repo
4. `log` for a compact Rust library
