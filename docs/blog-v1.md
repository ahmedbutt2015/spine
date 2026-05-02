# spine v1: a verified onboarding guide for unfamiliar codebases

You open a new repository. The README is broad, the file tree is noisy, and the architecture diagram either does not exist or cannot be trusted.

`spine` is built for that exact moment.

Run it at a repo root and it gives you two things immediately:

- a small architecture map built only from verified static-analysis edges
- a short onboarding guide that tells you what to read first

That is the pitch.

## What makes it different

Most onboarding tooling tries to sound smart. `spine` tries to be trustworthy.

It does not guess architecture edges. If an edge cannot be verified from source, it gets dropped. That means the diagram is intentionally smaller, but much more credible.

The full `/onboard` flow then turns that verified structure into:

- a TL;DR
- a mental model
- a prioritized reading order
- subsystem summaries
- a few gotchas

There is also `/map`, a token-free deterministic preview for people who just want the architecture first.

## The best first example

The strongest benchmark for launch is `axios`.

Why `axios` works so well:

- almost every developer recognizes it
- the codebase is real, but not overwhelming
- the request flow is easy to validate once you see the verified spine
- the before/after difference is obvious in minutes

If someone asks what `spine` is for, the shortest useful answer is:

> It shows you where to start in a codebase, and it proves the architecture edges it shows.

## How to try it

```bash
npm install -g @spine-io/onboard
onboard . --map-only
onboard .
```

If you are using Claude Code, the product shape is even simpler:

- `/map` for the fast architecture preview
- `/onboard` for the full guide

## Why this matters

The cost of getting oriented in a new codebase is usually paid in context switching, not just time. You open ten files, build the wrong mental model, and only then find the real entry path.

`spine` tries to compress that waste into one run and one small document.

That is v1.
