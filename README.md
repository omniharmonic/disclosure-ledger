# Trump Stock Tracker

A civic-transparency platform that ingests the President's securities-disclosure
filings (OGE Form 278-T / 278e) into rigorous structured data, layers in his
public statements and official government actions, and surfaces
transparently-scored timing correlations between them.

> This is a transparency tool. Disclosed amounts are statutory ranges, not exact
> figures. Timing correlations are facts and scored signals — never findings of
> illegality.

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product requirements
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical architecture
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — build plan
- [`docs/IMPROVEMENT_STRATEGY.md`](docs/IMPROVEMENT_STRATEGY.md) — production evaluation & remediation record

## Stack

Next.js (App Router) · Postgres (local dev / Neon prod) · Drizzle ORM ·
Python + Node pipeline (GitHub Actions) · Tailwind CSS. MIT licensed.

## Local development

```bash
npm install
createdb disclosure_ledger          # local Postgres
cp .env.example .env.local          # then fill in keys as needed
npm run db:migrate                  # apply committed migrations
npm run dev                         # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — unit + DB-backed integrity regressions (DB tests skip without `DATABASE_URL`) |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate` | Apply committed migrations (`src/db/migrations`) |
| `npm run db:generate` | Generate a new migration from schema changes |
| `npm run db:push` | Diff-push schema (local prototyping only) |
| `npm run db:studio` | Drizzle Studio |

## Pipeline

The ingestion pipeline lives in [`pipeline/`](pipeline/) (Python extractor) and
`src/pipeline/` (Node stages), and runs as a scheduled GitHub Action
(`.github/workflows/pipeline.yml`). Stages — each idempotent, each its own
failure domain, all logged to `ingestion_runs`:

```
discover → fetch → dedupe → parse → reconcile → statements (Truth Social)
→ cpd (govinfo) → actions (Federal Register + White House) → usaspending
→ enrich → prices → mentions → correlate → verify → graph-build
```

Key-gated stages (`ANTHROPIC_API_KEY`, `DATA_GOV_API_KEY`, price keys,
`RECONCILE_DATA_*`) are logged no-ops until their key is provisioned.

## Public API

Read-only JSON API under `/api/v1` — transactions, filings, statements,
actions, correlations, companies, graph, and bulk NDJSON/CSV export. OpenAPI
spec at `/api/v1/openapi.json`; human docs at `/api-docs`. Anonymous callers
get 500 requests/day per IP; `X-API-Key` raises the limit per key.

## Operations

- `/admin/review` — operator review queue for withheld filings (HTTP Basic
  Auth; enabled only when `ADMIN_PASSWORD` is set).
- `/api/revalidate?secret=…` — on-demand ISR refresh, called by the pipeline
  after each run (`REVALIDATE_SECRET`).
- CI (`.github/workflows/ci.yml`) runs typecheck, the full test suite against
  Postgres 16, and a production build on every push.
