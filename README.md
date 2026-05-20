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

## Stack

Next.js (App Router) · Postgres (local dev / Neon prod) · Drizzle ORM ·
Python + Node pipeline (GitHub Actions) · Tailwind CSS.

## Local development

```bash
npm install
createdb disclosure_ledger          # local Postgres
cp .env.example .env.local          # then fill in keys as needed
npm run db:push                     # apply schema
npm run dev                         # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run db:push` | Apply schema to the database |
| `npm run db:studio` | Drizzle Studio |

## Pipeline

The ingestion pipeline lives in [`pipeline/`](pipeline/) and runs as scheduled
GitHub Actions (see `.github/workflows/`). Stages: discover → fetch → parse →
ingest-statements → ingest-actions → enrich → correlate → graph-build.
