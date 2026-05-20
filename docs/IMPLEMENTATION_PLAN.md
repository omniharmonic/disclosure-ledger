# Implementation Plan — Presidential Conflict-of-Interest Tracker

*Working codename: `disclosure-ledger`*
*Version 1.0 — May 2026*

> **Companion documents:** [PRD.md](./PRD.md) (requirements) · [ARCHITECTURE.md](./ARCHITECTURE.md) (technical architecture).
> This plan sequences the build into four milestones (≈ one week each). Each phase lists tasks, deliverables, and a verification gate. **A phase is not complete until its gate passes with evidence** — run the checks, confirm the output.

---

## Phase 0 — Foundations (½ day)

Set up the skeleton before any feature work.

| # | Task |
|---|---|
| 0.1 | Create the **public** GitHub repo (public = free unlimited CI = transparency). Add MIT/CC license and README. |
| 0.2 | Scaffold Next.js (App Router) + TypeScript + Tailwind. |
| 0.3 | Create the Neon project; capture pooled + direct connection strings. Enable `pgvector` (`CREATE EXTENSION vector;`). |
| 0.4 | Add Drizzle ORM; configure `@neondatabase/serverless`. |
| 0.5 | Create `pipeline/` for the Python+Node pipeline (separate `requirements.txt` / `package.json`). |
| 0.6 | Write the initial migration: all tables from ARCHITECTURE §5. Apply to Neon. |
| 0.7 | Configure secrets: GitHub Actions secrets + Vercel env vars (Anthropic, Neon write/read URLs, api.data.gov, Tiingo, FMP). |
| 0.8 | Deploy the empty Next.js app to Vercel Hobby; confirm the build pipeline works. |
| 0.9 | Seed `persons` with the Donald J. Trump / President record. |

**Gate:** Repo deploys to Vercel; migrations applied; `SELECT` against Neon works from a Vercel route handler.

---

## Phase 1 — Trade Spine (Milestone M1)

**Objective:** every known Trump filing ingested, parsed, validated, enriched, and visible in a trades table and filing pages. This is the credibility floor — get it ironclad before anything else.

### 1A — Discovery & fetch

| # | Task |
|---|---|
| 1.1 | `discover` stage (Node): GET `extapps2.oge.gov/201/Presiden.nsf/PAS+Index?ReadViewEntries&OutputFormat=JSON&Count=-1`; parse `viewentry[]`; filter Trump + 278-T/278; extract UNIDs + `$FILE` URLs. |
| 1.2 | Seed the 7 known filing URLs from the handoff so discovery is validated against a known set. |
| 1.3 | `fetch` stage: download PDFs to disk; compute SHA-256; dedupe vs `filings.pdf_hash`; write `pending` filing rows with provenance. |
| 1.4 | Verify the embedded OGE PKCS#7 signature; record `signature_verified`. |
| 1.5 | White House fallback discovery (monitor `wp-content/uploads` PDF patterns). |

### 1B — Parser (the hard part — see ARCHITECTURE §4)

> **Design decision worth pausing on.** The parser's confidence threshold governs what goes public. Too strict → real filings stuck in review; too loose → bad data ships. The recommended gate is *consensus-or-adjudicated AND all structural checks pass*. **This is a judgment call about how much to trust the LLM adjudicator vs. requiring a human** — decide the threshold deliberately and record the rationale in the methodology page, because it is the single most consequential parameter in the product.

| # | Task |
|---|---|
| 1.6 | `parse` stage (Python): camelot `lattice` extraction of the transaction grid. |
| 1.7 | pdfplumber extraction (`vertical_strategy="lines"`) of the same rows. |
| 1.8 | Row-level diff by `#`; agreement → confidence 1.0. |
| 1.9 | Claude adjudicator (tool use, strict JSON schema) for disagreeing rows + irregular attached-schedule pages. |
| 1.10 | Validation gate: sequential `#`, "Page X of Y" reconciliation, enum membership, date sanity. |
| 1.11 | Amount-band normalization (band index + min/max — ARCHITECTURE §4.3). |
| 1.12 | Write `transactions`; set `filings.status` = `parsed` or `review`. |
| 1.13 | CLI tool `parse-pdf` for manual single-PDF runs and debugging. |

### 1C — Validation & reconciliation

| # | Task |
|---|---|
| 1.14 | Ingest the free ProPublica Trump disclosures dataset; reconcile each transaction (ticker+date+band); set `reconciled_sources`. |
| 1.15 | Quiver paid API deferred to a later version (v1 is free-tier only). ProPublica is the v1 reconciliation source; capitoltrades.com browse is a free manual spot-check. |
| 1.16 | Build the low-confidence review queue view for an operator. |

### 1D — Enrichment

| # | Task |
|---|---|
| 1.17 | Ticker resolution: cache SEC EDGAR `company_tickers.json`; fuzzy-match `description_raw`; OpenFIGI fallback; upsert `companies`. |
| 1.18 | Price enrichment: Tiingo EOD for transaction date + current; `price_cache`; compute `gain_loss_pct`. FMP cross-check. |
| 1.19 | Sector/industry from EDGAR SIC → GICS mapping. |

### 1E — Minimal frontend

| # | Task |
|---|---|
| 1.20 | Trades table page: searchable, sortable, filterable; amounts as ranges. |
| 1.21 | Filing list + filing detail pages (metadata, rows, source PDF link, parse confidence). |
| 1.22 | `/api/v1/transactions` + `/api/v1/filings` read endpoints. |

**Gate (M1):**
- All known filings ingested; `transaction_count` matches each PDF's stated total.
- ≥99.5% of rows pass the validation gate; review queue worked through.
- Spot-reconcile ≥20 transactions against ProPublica — agreement documented.
- Trades table and filing pages render real data with working source links.

---

## Phase 2 — Statements & Actions (Milestone M2)

**Objective:** continuously-updated, attribution-verified statement corpus + official-action record, with company/sector mentions detected and quote spans verified.

### 2A — Statement ingestion (waterfall — ARCHITECTURE §3.2)

| # | Task |
|---|---|
| 2.1 | American Presidency Project polite structured scraper (primary, timely). |
| 2.2 | govinfo CPD API client (`/collections/CPD/...` → `DCPD-*` packages); authoritative backfill. |
| 2.3 | CPD reconciliation: when CPD publishes an event already ingested from a faster source, upgrade text + link `superseded_by`. |
| 2.4 | Truth Social feed poller (`ix.cnn.io/.../truth_archive.json`); dedupe by `id`; **mirror raw JSON on every poll**. |
| 2.5 | whitehouse.gov `/remarks/` discovery scraper (events + official video IDs). |
| 2.6 | Caption fallback: YouTube Data API uploads-playlist discovery of C-SPAN / official channel video IDs; retrieve existing caption tracks via Supadata (free tier) — **no audio/ASR**; text-only LLM speaker-segmentation isolates the President's spans; tag `caption_derived`, set speaker-attribution confidence, flag low-confidence spans `needs_review`. |
| 2.7 | Every statement records `attribution_method` (`official_transcript`\|`caption_derived`) + `attribution_conf`; content-hash dedupe. |

### 2B — Mention detection (precision-critical — ARCHITECTURE §3, FR-S4/S5)

> **Design decision worth pausing on.** Mention detection is where misattribution and false positives creep in. The pipeline is layered (cheap gazetteer pre-filter → NER disambiguation → LLM extraction with quote spans). **The judgment call is the LLM prompt's precision/recall balance and the confidence threshold for emitting a mention** — a false "Trump praised NVIDIA" is a credibility/legal hazard, so bias toward precision and require the verbatim quote span to be programmatically verified present in the source text before any mention is stored.

| # | Task |
|---|---|
| 2.8 | Build the company gazetteer (ticker → company → aliases/brands/subsidiaries/products) from `companies`. |
| 2.9 | Gazetteer + fuzzy pre-filter (`flashtext`/`rapidfuzz`). |
| 2.10 | spaCy NER `ORG`/`PRODUCT` disambiguation + entity linking to `company_id`. |
| 2.11 | Claude extraction: strict JSON with `exact_quote`, `char_start/end`, `sentiment`, `stance`, `confidence`. |
| 2.12 | **Quote-span verification**: reject any span not byte-present in `full_text`. Write `statement_mentions`. |
| 2.13 | Statement embeddings → `pgvector` for semantic search/dedup. |

### 2C — Official actions

| # | Task |
|---|---|
| 2.14 | Federal Register API client (`conditions[type]=PRESDOCU`, date filters) → `actions`. |
| 2.15 | USAspending API client (`spending_by_award`) → contract/grant `actions` filtered to the traded-company universe. |
| 2.16 | Action→target linking (named company / sector / contract recipient) → `action_targets`. |

**Gate (M2):**
- APP + CPD + Truth feeds ingesting daily; each statement has an `attribution_method`.
- Zero stored mentions with an unverifiable quote span (assert in a test).
- Federal Register + USAspending actions ingested and linked to companies.
- Manual audit of 20 mentions: no misattributions, no false company links.

---

## Phase 3 — Correlation & Exploration (Milestone M3)

**Objective:** the correlation engine plus the compelling exploration surfaces.

### 3A — Correlation engine (ARCHITECTURE §6)

| # | Task |
|---|---|
| 3.1 | Candidate generation: per trade, window `[D−45d, D+30d]`, gather statements + actions touching company/sector. |
| 3.2 | Implement the 6-component scoring model; persist `signal_score` + full `components` JSONB + `scoring_version`. |
| 3.3 | `correlate` stage writes `correlations`; threshold filter. |
| 3.4 | `graph-build` stage: rebuild `graph_edges` + node projection from authoritative tables. |
| 3.5 | `/api/v1/graph?node=&depth=` — bounded recursive CTE (depth ≤ 3, cycle guard, LIMIT) → `{nodes, links}`. |

### 3B — Exploration UI

| # | Task |
|---|---|
| 3.6 | Dashboard: headline stats, top holdings, sector breakdown (Recharts), recent trades, gain/loss leaders. |
| 3.7 | Trade detail page: correlation panel — linked statements/actions, each with score breakdown + source link + disclaimer. |
| 3.8 | Company page: trades + statements + actions; price chart with buy/sell markers. |
| 3.9 | Timeline page: vis-timeline, lanes for trades / statements / actions; zoom, pan, filter. |
| 3.10 | Graph page: react-force-graph (2D); lazy node expansion; node-type styling. |
| 3.11 | Accessible tabular equivalents for timeline + graph. |

**Gate (M3):**
- Every trade detail page shows scored, source-linked correlations with visible component breakdowns.
- Timeline and graph render real data and are interactive.
- UC2 ("what did he say about Palantir before he bought it?") answerable in < 60s by a test user.
- All correlation surfaces carry the standing disclaimer.

---

## Phase 4 — Open Data & Hardening (Milestone M4)

**Objective:** public API, methodology transparency, automation hardening, launch readiness.

| # | Task |
|---|---|
| 4.1 | Complete `/api/v1/*` (statements, actions, correlations, companies, export); consistent envelope + pagination. |
| 4.2 | API-key auth (SHA-256 hashes) + per-key rate limiting. |
| 4.3 | OpenAPI spec + interactive `/api-docs` page. |
| 4.4 | Bulk export endpoint (NDJSON/CSV snapshots). |
| 4.5 | Methodology page: 278-T explainer, STOCK Act / Ethics in Government Act, amount bands, source waterfall, **scoring weights**, parser confidence policy, disclaimers, attribution. |
| 4.6 | About page: permitted-use statement, data caveats, last-updated. |
| 4.7 | Wire the full GitHub Actions daily workflow (all stages, ARCHITECTURE §8); `ingestion_runs` logging; failure alerting. |
| 4.8 | Vercel Cron heartbeat → `workflow_dispatch`; ISR revalidation webhook after each run. |
| 4.9 | Mobile responsive pass; WCAG 2.1 AA audit. |
| 4.10 | SEO: meta tags, Open Graph, JSON-LD structured data, sitemap. |
| 4.11 | Performance: ISR tuning, query/index review, graph payload caps. |
| 4.12 | Editorial review: every UI/API string audited against the neutral-language rules (PRD §8.2). |

**Gate (M4):**
- API documented, rate-limited, returns correct data; bulk export works.
- Methodology page complete and accurate.
- **Pipeline runs unattended for 7 consecutive days with zero manual intervention** and no data corruption.
- Editorial review signed off — no accusatory language anywhere.

---

## Cross-Cutting Workstreams

Run continuously across all phases:

- **Provenance assertions** — automated tests that every public datum has a resolvable source URL and that filings/statements/actions are immutable.
- **Idempotency tests** — re-run each stage; assert no duplicates, no corruption.
- **Cost monitoring** — v1 is strictly free-tier infrastructure; the only metered spend is LLM tokens. Watch Neon CU-hours and Claude token spend each phase; budget ceiling ~$15/mo.
- **Methodology versioning** — any change to scoring weights or parser policy bumps a version and is changelogged on the methodology page.
- **Legal/editorial discipline** — neutral-language rules apply from the first line of UI copy, not just at the M4 review.

---

## Sequencing Rationale

1. **Trades before everything (M1).** They are the verifiable spine; if extraction is not ironclad, nothing downstream is trustworthy. Build and prove the parser first.
2. **Statements & actions next (M2).** They are useless without companies to attach to — M1 produces the company universe the gazetteer and action-linking need.
3. **Correlation needs both sides (M3).** The engine can only score once trades, statements, and actions all exist. Exploration UI lands here because it visualizes correlations.
4. **Open data & hardening last (M4).** The API and automation should expose a dataset that is already correct; hardening a wrong dataset wastes effort.

Each milestone is independently demoable: M1 is a working trade tracker, M2 adds the statement/action record, M3 makes it explorable and correlated, M4 makes it open and self-sustaining.

---

## Definition of Done (v1)

- Every known Trump 278-T/278e filing ingested, parsed, validated, published — every row source-traceable.
- Statement corpus updating daily from ≥3 sources; every statement attribution-verified or flagged.
- Federal Register + USAspending actions ingested and linked.
- Every trade carries scored, source-linked correlations with visible component breakdowns.
- Dashboard, trades table, company, filing, timeline, graph, methodology, and API-docs pages live.
- Public API documented, rate-limited, with bulk export.
- Daily pipeline runs unattended; failures alert.
- All-in cost < $15/month (free-tier infrastructure; LLM tokens only).
- No accusatory language anywhere; methodology fully public.
