# spine v1: stop guessing where a codebase starts

You know this feeling:

You open a new repository, read the README, click five files, open the wrong folder, find a second entry point, and ten minutes later you still cannot answer a basic question:

**What should I read first if I want the real shape of this codebase?**

That is the moment `spine` is built for.

`spine` is a small onboarding tool that scans a repository, finds a verified architecture spine, and turns it into something a developer can actually use:

- a compact architecture map
- a prioritized reading order
- a short mental model
- subsystem summaries
- a few gotchas

The important part is not that it looks smart. The important part is that it stays grounded.

`spine` only draws architecture edges it can verify from source.

## Why Claude Code users should care

If you are already living inside Claude Code, `spine` is not just a documentation tool. It is a context tool.

The first run does two useful things:

- it generates `ONBOARDING.md` for a human-readable tour
- it writes `.claude/REPO_CONTEXT.md`, a compact repo snapshot for future Claude sessions

That second file matters a lot.

Instead of re-explaining the repo every time, you get a persisted summary of:

- project shape
- primary language
- verified architecture spine
- subsystem boundaries
- key entry points

So the value is not only "help me understand the codebase once."

It is also:

> help future Claude sessions start from a grounded snapshot instead of burning tokens rediscovering the same repo shape.

That does not mean Claude magically knows every line of the application forever. It means `spine` leaves behind a small verified context file that is useful to refresh and reuse as the repo evolves.

## It is designed to feel instant inside Claude Code

The repo already ships with Claude Code skill definitions for:

- `/map`
- `/onboard`

That means the product story is simple:

1. Run `/map` when you want a fast, token-light architecture preview.
2. Run `/onboard` when you want the full guided tour.
3. Let `spine` refresh `.claude/REPO_CONTEXT.md` so later Claude sessions start from a much better baseline.

For teams using Claude Code heavily, this is one of the most interesting parts of the product.

You are not just generating a document. You are creating a reusable repo memory.

## The problem with most onboarding docs

Most repo onboarding today breaks in one of three ways:

- it is too broad and turns into a wall of context
- it is stale and no longer matches the code
- it sounds confident while quietly guessing the architecture

That last one is the worst.

If a diagram is wrong, it does not just waste time. It gives you the wrong mental model, and you end up reading the code in the wrong order.

`spine` takes a narrower bet:

> smaller, verified, and useful beats bigger, prettier, and guessed.

## What spine actually gives you

There are two modes.

### `/map`

Use this when you want the fastest answer possible.

It gives you:

- a validated Mermaid diagram
- a `mermaid.live` link
- no synthesis step
- no `ONBOARDING.md`

This is the "show me the real backbone first" mode.

### `/onboard`

Use this when you want the full tour.

It writes an onboarding document with:

- `TL;DR`
- `Architecture map`
- `Mental model`
- `Reading order`
- `Entry points found`
- `Subsystems`
- `Gotchas`

This is the "I just joined this codebase, help me become dangerous fast" mode.

## Try it in 3 minutes

If you want the best first impression, use `axios`.

It is the best launch example because:

- most developers already know what it is
- the repo is real but not huge
- the request flow is meaningful
- the output is easy to judge with your own eyes

Install:

```bash
npm install -g @spine-io/onboard
```

Clone a benchmark:

```bash
git clone https://github.com/axios/axios.git
cd axios
```

Start with the map:

```bash
onboard . --map-only
```

Then generate the full guide:

```bash
onboard .
```

That is the core experience.

If you are already in Claude Code, the equivalent mental model is:

```text
/map      -> show me the verified backbone
/onboard  -> write the full guide and refresh repo context
```

## What makes the first run feel good

The first useful moment is not a giant report. It is a reduction in ambiguity.

When `spine` works well, you feel three things quickly:

1. You can see the real entry path instead of guessing it.
2. You know which files matter first.
3. You can ignore the rest for now without feeling lost.

That is a very different experience from skimming a file tree and hoping your intuition is right.

## Why axios is such a good demo

Before `spine`, a developer usually bounces around files like:

- `README.md`
- `package.json`
- `index.js`
- `lib/axios.js`
- `lib/core/Axios.js`

That is not terrible, but it is not guided either. You are still doing the work of building the map in your head.

After `spine`, the repo gets compressed into a much more actionable shape:

- a small verified graph
- a short list of files to read first
- a sentence or two that gives you the right mental frame

That is the whole product idea in one repo.

If someone asks what `spine` does, the shortest honest answer is:

> It shows you where to start in a codebase, and it only draws the edges it can prove.

## The part I care about most

I did not want to build another tool that generates a beautiful but suspicious diagram.

So the rule is simple:

- if an edge can be verified, keep it
- if it cannot be verified, drop it

That means the diagram is sometimes smaller than what a human might infer.

Good.

Smaller and true is better than bigger and imagined.

## Why this can save tokens over time

There are really two savings stories here.

The first is human:

- less random file clicking
- less repeated explanation across teammates
- less time building the wrong mental model

The second is model-side:

- `spine` writes `.claude/REPO_CONTEXT.md` by default
- the Anthropic synthesis path supports prompt caching on the structured context block
- the CLI surfaces estimated cost and actual cost when usage metadata is available

So if you keep re-running onboarding in the same repo, or keep revisiting the same codebase with Claude, the product is trying to make those later passes cheaper and more grounded than the first one.

## Claude Code is a natural fit

`spine` is also shaped to work well with Claude Code.

The flow is simple:

- run `/map` when you want a fast architecture preview
- run `/onboard` when you want the full guide
- let `.claude/REPO_CONTEXT.md` carry verified context into later conversations

So instead of starting every coding session from scratch, you can start from a verified repo summary.

That is probably the most compelling long-run use case:

not "generate one nice markdown file,"

but "leave behind a compact, refreshable repo context file that helps Claude spend less time relearning the same app."

## A fun way to try it

If you want to make this feel more interactive, try this little challenge:

1. Open a repo you know only vaguely.
2. Before running `spine`, write down which file you think is the true entry point.
3. Run `onboard . --map-only`.
4. See whether the verified spine agrees with your guess.
5. Then run `onboard .` and compare your reading order with the one it generates.

That turns the tool into a quick test of your own codebase intuition, which is honestly a fun way to experience it.

## Where to use it next

After `axios`, I would try these:

- `glow` for a clean Go CLI example
- `poetry` for a larger Python repo
- `log` for a compact Rust library
- your own codebase right before onboarding a teammate

The most interesting use case is not a benchmark repo.

It is the repository where your team keeps saying, "someone should really document how this thing is wired."

## Why this matters

The cost of a strange codebase is not just time. It is hesitation.

You do not know what to trust yet.
You do not know what is core versus incidental.
You do not know whether the architecture in your head is real.

`spine` is an attempt to reduce that hesitation.

Not by telling you everything.

By helping you start in the right place.

That is v1.
