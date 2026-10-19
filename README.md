# Scent Census

A personal fragrance advisor that reads your shelf: catalog your bottles, tell it what you refuse to smell, and it shows what to add next within your budget, with a public census on how close clones smell.

## Documents, in reading order

1. `docs/PRD-v1.md` — the product spec (one job, refusals, features, milestones)
2. `docs/STACK.md` — the stack memo the build executes against
3. `docs/RESEARCH-hard-parts.md` — catalog data, price plumbing, census cold start, recalibrated numbers
4. `docs/RESEARCH-naming.md` — brand decision (Scent Census) and its basis

## Dev

```sh
npm run typecheck  # missing environment values crash here, loudly
npm run test       # vitest, unit + integration
```

Domain rules worth knowing before code review: environment values may only be read in `src/config.ts` (ESLint enforces it). Numeric floors live in `src/domain/floors.ts`. Tests are red-first: specs land in the same commit that fails, implementations close them.
