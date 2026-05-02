# Runtime Prompt Contract for `/map`

`/map` does not invoke a synthesis model. It simply exposes the validated architecture map that the local `spine` pipeline produces from static analysis.

## Hard rules

- Do not synthesize or infer new architecture edges.
- Do not write files.
- Output must be the Mermaid diagram and the `mermaid.live` URL only.

## Command path

The skill maps directly to the local CLI via:

```bash
npm run map -- .
```
