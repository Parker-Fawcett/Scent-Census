# Scent Census — Stack Memo

Decides the stack. Written after the PRD and the hard-parts research, per the agreed order. This is the memo the build executes against; changes cost a committed edit to this file in the same PR.

---

## Decision

**One Next.js app, TypeScript strict, Postgres, Prisma, Vitest red-first, Playwright on localhost only.** Deployed to Vercel against Neon. Auth is Auth.js with cookie sessions, never localStorage tokens.

## Why each choice, against what actually burned last time

| Concern | Decision | Catchandtrade lesson it answers |
|---|---|---|
| Architecture | Single Next.js 15 app. Route handlers are the API. No monorepo, no packages/, no turbo | The workspaces collapse mid-flight froze four contradictory eras of docs; the app that actually worked was one Next app |
| API style | Route handlers per resource, one exported handler needs per file where routes grow. If a route file exceeds ~300 lines, first action is splitting by endpoint Domain rather than reaching for an Express server | README described "packages/api on port 3003" for a server that never shipped |
| Language / runtime | TypeScript strict mode, Node 22, no `any` without a written justification comment | 29 `any` casts, root package.json named `"temp"` |
| ORM | Prisma. Schema is the contract; migrations checked in; no SQL patch files next to the ORM | `add-missing-tables.sql` drifted from schema.prisma |
| Database | Neon Postgres (single `DATABASE_URL`, the only connection string in the repo). Local dev/test Postgres via docker-compose with a different port and separate test DB | `db.ijnajdpcplapwiyvzsdh...` password committed in AGENTS.md; three contradicting DB stories |
| Authentication | Auth.js v5: Google provider + credentials (bcryptjs), session via httpOnly cookies using jose under the hood. No dev fallback secrets; missing secrets crash at boot, loudly, in every environment | JWT in localStorage, accepted legacy base64 tokens, fallback secrets in prod code |
| Config | One `src/config.ts` reads all env. ESLint rule bans `process.env` anywhere else | Three overlapping URL helpers, 20 files each declaring API_URL |
| Unit + integration tests | Vitest + Testing Library. Pure domain functions first (score, trimmed mean, census rollup, catalog diff), then routes against a real local Postgres via integration tests | Jest `--passWithNoTests` let everything rot |
| E2E | Playwright, strictly against localhost; no test ever references the prod domain | Playwright suite hardcoded to production and stored a failing run |
| Rollup jobs | Next route endpoints protected by a secret header, triggered by scheduled GitHub Actions (census rollup, estimate rollup, release diff). No new job framework | nightlySync vaporware with checkboxes marked done |
| eBay client | One server-side module, token cached in DB, typed responses, `source: 'ebay-asking'` on every point | `getEbayToken` recreated per request, tcgplayer leftovers |
| Ingest | `scripts/ingest` reads FragDB CSV, contract tests on samples first, purchase only after tests pass | Task checklists marked done for deleted code |
| CI | GitHub Actions on every push: typecheck, lint, unit, integration, build. PRs cannot merge red | Stored failing Playwright run in test-results/ |
| Hosting | Vercel (hobby free tier to start). Single deployable. `env.example` lists keys only, values in dashboard | Vercel/Render/Neon/Supabase stories contradicting across docs; render.yaml debug blob |

## What we deliberately do not use

No monorepo tooling, no Express, no tesseract/scan features (refused for v1), no Stripe, no Redis, no queue system (GitHub Actions + route endpoints cover the job volume), no email service (creator invites are manual founder outreach; digests are refused), no mobile shell, no analytics product surface (privacy-safe counters only).

## Repo layout (and what happens to this folder)

```
fragrence/
  apps? → NO. Single app at repo root:
  src/{app,components,lib,domain,hooks}
  src/domain/            ← pure functions: score.ts, trimmedMean.ts, census.ts, catalogDiff.ts, staleness.ts
  prisma/schema.prisma
  scripts/ingest/
  tests/unit/**  tests/integration/**  tests/e2e/**
  docs/PRD-v1.md (moved here)  docs/RESEARCH-hard-parts.md  docs/STACK.md
```

The Fragrence folder contained the catchandtrade reference repo during planning. New repo is `scentcensus/` (decision in RESEARCH-naming.md), sitting beside `catchandtrade/` as an untracked reference, so nothing of the old repo ever enters git history.

## TDD operating rule (the point of choice #Test stack)

Red-first is the workflow, not a badge: every domain function in `src/domain/` and every ingest contract lands as a failing test first, in the same commit as its implementation. Route-level integration tests lock auth, prices, census, and follows behavior before the UI is built. The golden user fixtures (M4) assert feed composition incl. the reason line, so "personalized" stays a testable claim rather than a vibe.

## Open dependencies and their order

1. eBay developer keys (application latency, start week 1)
2. FragranceNet affiliate application (data feed + affiliate rails)
3. FragDB $200 purchase (after ingest contract tests pass)
4. Domain purchase + handle availability check for "Fragrence" (name stays per decision; TLD choice is the open bit)
