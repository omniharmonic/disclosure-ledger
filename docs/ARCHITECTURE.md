# Technical Architecture — Presidential Conflict-of-Interest Tracker

*Working codename: `disclosure-ledger`*
*Version 1.0 — May 2026*

> **Companion documents:** [PRD.md](./PRD.md) (requirements) · [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (build sequence).

---

## 1. Architectural Overview

### 1.1 Guiding principles

1. **Split fragile/heavy work from the serving layer.** All scraping, PDF parsing, and LLM batch work runs in **GitHub Actions** (a public repo = unlimited free CI minutes, full Linux VMs, no 300s ceiling, no Chromium-packaging hacks). Vercel hosts only the Next.js web app and read APIs on the **free Hobby tier**. This is the cheapest *and* most reliable topology.
2. **Provenance is non-negotiable.** Every row carries its origin: source URL, PDF hash, page number, extraction method, confidence. Nothing exists without a traceable source.
3. **Idempotent, immutable ingestion.** Re-running the pipeline never duplicates or corrupts. Filings/statements/actions are immutable; corrections are new versions.
4. **Precompute everything expensive.** Correlation scores and graph edges are materialized by batch jobs. Request-time code only reads.
5. **The database is the single source of truth.** Postgres (Neon) holds structured data *and* the knowledge graph (typed node tables + one polymorphic edge table). No separate graph DB, no separate vector DB — `pgvector` lives in the same Postgres.

### 1.2 System diagram

```
┌─────────────────────── GitHub Actions (public repo, free CI) ───────────────────────┐
│                                                                                      │
│  Scheduled workflows (cron) — Python + Node, full Linux VMs, no duration ceiling      │
│                                                                                      │
│   discover ──▶ fetch ──▶ parse ──▶ validate ──▶ enrich ──▶ correlate ──▶ graph-build  │
│   (OGE JSON)  (PDFs,    (camelot   (row/page   (tickers,  (score        (materialize  │
│               feeds)    +plumber   checks)     prices,    trade↔event   nodes/edges)  │
│                         +LLM)                  mentions)  pairs)                      │
│                                                                                      │
│        each stage is a durable step: writes to Neon, retries independently            │
└────────────────────────────────────────────┬─────────────────────────────────────────┘
                                              │ SQL over pooled connection
                                              ▼
                              ┌──────────────────────────────┐
                              │   Neon Postgres (free tier)   │
                              │   structured data + graph     │
                              │   + pgvector embeddings       │
                              └───────────────┬───────────────┘
                                              │ @neondatabase/serverless (HTTP)
                                              ▼
┌──────────────────────────── Vercel (Next.js, Hobby tier, $0) ────────────────────────┐
│  App Router pages (SSR/ISR)  │  Route handlers /api/v1/*  │  Cron: pings GH pipeline   │
│  Dashboard · Trades · Company · Filing · Timeline · Graph · Methodology · API docs    │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                              External APIs (read): SEC EDGAR · Tiingo/FMP ·
                              govinfo · Federal Register · USAspending · Anthropic
```

### 1.3 Why not run the pipeline on Vercel?

Vercel Workflows (GA April 2026) is technically the *right* durable-orchestration tool and is documented as a fallback. But for this project GitHub Actions wins on cost and reliability:

- **Headless browsers / heavy CPU:** Not even needed for OGE (see §3.1), but PDF parsing is CPU-bound; GH Actions runners are free and unmetered for public repos, Vercel bills Active CPU.
- **Python:** `camelot` + `pdfplumber` are Python. On Vercel, mixing Python with a Next.js app requires the Services configuration; in GH Actions it is `pip install`.
- **No 300s ceiling:** A full filing batch (thousands of rows + LLM adjudication) can exceed 5 minutes.
- **The repo is public anyway** — it is a transparency project — so CI is free.

**Decision:** GitHub Actions for the pipeline; Vercel Hobby for serving. Workflow DevKit is the documented migration path if the pipeline ever needs sub-daily cadence or per-user durability. Vercel Cron is used only as an optional heartbeat that pings a GH `workflow_dispatch` webhook.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Web framework | Next.js (App Router) | SSR/ISR, route handlers for the API, first-class Vercel hosting. |
| Hosting (web) | Vercel Hobby | $0; static + serverless for a low-traffic read app. |
| Database | Neon Postgres (free tier) | 0.5 GB storage, 100 CU-hr/mo, scale-to-zero, branching, `pgvector` included. Ample for < 100k rows. |
| DB access (serverless) | `@neondatabase/serverless` (HTTP/WebSocket driver) over the **pooled** connection string | Avoids connection exhaustion and cold-start TCP cost in serverless functions. |
| ORM / query | Drizzle ORM | Type-safe, lightweight, SQL-first, plays well with the serverless driver and with raw recursive CTEs. |
| Pipeline runtime | GitHub Actions (Python 3.13 + Node 24) | Free CI, full VMs, no duration ceiling. |
| PDF parsing | `camelot` (lattice) + `pdfplumber` (cross-check) + Anthropic Claude (adjudicator) | Defense-in-depth extraction; see §4. |
| LLM | Anthropic Claude API (structured tool use), with prompt caching | Quote-span extraction, parser adjudication, mention classification, caption speaker-segmentation. |
| Caption retrieval | Supadata (free tier) | Fetches existing YouTube/C-SPAN caption tracks; no audio/ASR performed by this platform. |
| Embeddings | `pgvector` in Neon — **deferred (v1 ships without embeddings)** | Semantic statement search/dedup when added; content-hash dedup suffices at v1 scale. |
| Styling | Tailwind CSS | Standard, fast. |
| Charts | Recharts | Dashboard charts. |
| Timeline | vis-timeline | Mature multi-lane event timeline. |
| Graph | react-force-graph (2D canvas) | Handles thousands of nodes; matches the `{nodes, links}` API shape. Sigma.js is the documented upgrade path beyond ~10k visible nodes. |
| Job scheduling | GitHub Actions `schedule:` cron | Daily pipeline trigger. |
| File storage | Git LFS in the repo, or Neon-adjacent object storage | Raw source PDFs cached for provenance. (Repo LFS is simplest and free at this volume.) |

---

## 3. Data Sources — Access Patterns

### 3.1 OGE presidential filings (trades) — *no headless browser*

The OGE site is an HCL Domino application. Domino exposes every view as machine-readable data via the `?ReadViewEntries` URL command — **verified working live**:

```
GET https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?ReadViewEntries&OutputFormat=JSON&Count=-1
```

- Returns JSON: `@toplevelentries` count + a `viewentry[]` array; each entry carries a `@noteid`/UNID and column `entrydata`.
- `Count=-1` returns all rows; `Start=n` paginates; the view currently holds ~210 entries (Domino caps a view read at 65,535 — irrelevant here).
- PDF documents follow a stable pattern:
  `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/{UNID}/$FILE/{filename}.pdf`
- Discovery = poll the JSON view daily, filter for `Trump` + form type `278-T`/`278`, diff against ingested UNIDs.
- PDFs are **text-based, digitally signed** by the OGE certifying official (embedded PKCS#7). Parse locally (download to disk first — they are large, up to ~150 pages). Verify the signature as a provenance check.
- Politeness: descriptive User-Agent + contact email; ≥2s between requests; honor robots.txt.

**Fallback discovery:** monitor `whitehouse.gov/wp-content/uploads/...` PDF patterns and re-poll known UNID patterns. OGE remains ground truth.

### 3.2 Statement sources — prioritized waterfall

| Priority | Source | Access | Role | Notes |
|---|---|---|---|---|
| 1 (timely) | American Presidency Project (UCSB) | Polite structured scrape of `/documents/app-categories/.../spoken-addresses-and-remarks` filtered to Trump; stable per-doc URLs; Drupal query params for paging | Daily primary | Single-speaker, clean HTML. Rate-limit, cache, identify crawler. |
| 2 (authoritative) | govinfo Compilation of Presidential Documents | `api.govinfo.gov` REST, `api.data.gov` key. `GET /collections/CPD/{since}/{now}` to discover `DCPD-*` packages; `/packages/{id}/htm|xml|mods` for text | Daily backfill + correction | Official verified verbatim record; lags days–weeks. **CPD text wins** on conflict. 40 req/s with key. |
| 3 | Truth Social posts | Poll `https://ix.cnn.io/data/truth-social/truth_archive.json` every ~15 min; dedupe by `id`; **mirror raw JSON on every poll** | Continuous | Undocumented CNN endpoint — mirror immediately. Fallback: trumpstruth.org. |
| 4 (discovery) | whitehouse.gov `/remarks/` | Scrape paginated listing for new events + official YouTube video IDs | Discovery index only | No transcripts since May 2025; used to detect events missing from 1–2. |
| 5 (caption fallback) | C-SPAN / official YouTube **existing captions** | Discover video IDs via YouTube Data API uploads-playlist pattern (~1 unit/call); retrieve the video's *already-published* caption track via a caption-retrieval service (Supadata free tier, which also absorbs the cloud-IP blocking problem) | For events covered only on video | **No audio/ASR is performed by this platform.** Captions have no speaker labels → passed through a text-only LLM speaker-segmentation step; tagged `caption_derived`; gated by speaker-attribution confidence before auto-correlation. |

> **Caption constraint.** The official YouTube Data API's `captions.download` works only for videos the caller owns — it cannot fetch C-SPAN's or news channels' captions. The caption-retrieval service in priority 5 retrieves the publicly-displayed caption track instead. The canonical, professionally speaker-attributed transcript record remains priorities 1–2 (APP, CPD); priority 5 is a coverage extension, not a primary source.

### 3.3 Official actions

| Source | Endpoint | Auth | Use |
|---|---|---|---|
| Federal Register | `https://www.federalregister.gov/api/v1/documents.json?conditions[type]=PRESDOCU&conditions[publication_date][gte]=...` | None | Executive orders, proclamations, memoranda, relevant rules. |
| USAspending | `https://api.usaspending.gov/api/v2/search/spending_by_award/` (POST) | None | Federal contract/grant awards by recipient/NAICS/agency. |
| Regulations.gov | `api.regulations.gov` | `api.data.gov` key | Optional — rulemaking dockets affecting sectors. |

### 3.4 Enrichment

| Need | Source | Auth / limits |
|---|---|---|
| Company name → ticker/CIK | SEC EDGAR `company_tickers.json` | No key; **User-Agent with contact email required**; 10 req/s. Cache the whole file. |
| Ticker fallback (ADRs, funds, foreign) | OpenFIGI API | Free; higher limits with a free key. |
| EOD price history (charts) | Alpha Vantage `TIME_SERIES_WEEKLY` | Free tier — 25 req/day; tickers fetched in correlation-priority order, coverage fills in across daily runs. |
| Current quote | Finnhub `/quote` | Free tier — 60 req/min; refreshed every run. |
| Sector / industry | EDGAR SIC + GICS mapping | Derived from EDGAR. |

---

## 4. Trade Extraction Pipeline ("ironclad" parsing)

> **Revised to describe the implemented design.** The original plan assumed text-based
> PDFs and specified a camelot + pdfplumber row-diff consensus. The real filings turned
> out to be **scanned documents** (some with a poor embedded OCR layer, the newest with
> none), which ruled-grid extractors cannot read. The implemented pipeline is therefore
> **Surya OCR → content-anchored parsing → validation gate → LLM adjudication**, described
> below. A second independent extractor remains the upgrade path if a future filing
> arrives text-based (see docs/EXTRACTION_UPGRADE.md).

The 278-T transaction table is a ruled grid: `# | Description | Type | Date | Amount`.

```
PDF ──▶ Surya OCR (per-page, cached) ──▶ content-anchored row parser ──▶ validation gate
                                                                         │
                              confidence < 0.9 + ANTHROPIC_API_KEY ──▶ Claude re-reads the
                                                                       PDF under a strict
                                                                       schema; result kept
                                                                       only if it improves
```

### 4.1 Extraction stages (implemented)

1. **OCR — Surya** (transformer OCR; far more accurate than Tesseract on degraded scans). Each page is rendered at ~216 DPI and OCR'd once; output cached in `data/cache/ocr/` (committed — deterministic and CPU-expensive).
2. **Content-anchored parsing** (`pipeline/extract_278t.py`): each transaction row is located by its recognizable **amount band** and **transaction date** rather than fragile column geometry; description/type/late-flag are assigned by content pattern, with fuzzy type recovery for OCR-garbled type cells and bond-maturity-date exclusion.
3. **Adjudicator — Claude tool use** (`src/pipeline/lib/adjudicator.ts`). When a filing scores below 0.9 and `ANTHROPIC_API_KEY` is configured, Claude re-reads the raw PDF under a strict JSON schema. A truncation guard ensures the LLM result is merged **only if it improves** on the heuristic; adjudicated filings carry `parse_method = "llm_adjudicated"`, confidence 0.92.

### 4.2 Validation gate (every filing must pass)

- **Row validity:** real date, valid amount band, non-boilerplate description; per-filing confidence = validShare · (0.75 + 0.25·typeKnownShare) · (1 − 0.10·ocrShare).
- **Page reconciliation:** parse the "Page X of Y" footer; confirm all Y pages ingested (mismatch discounts confidence).
- **Enum membership:** `type` and amount band must match closed vocabularies (unknown type discounts but does not reject a row whose date/amount/description are sound).
- **Date sanity:** transaction date within a plausible window of the filing year (excludes bond maturity dates).
- **Sequential numbering:** OCR row numbers are unreliable, so rows are numbered in document order; integrity is enforced by page-count reconciliation and per-page row counts.
- **Cross-source reconciliation:** match each row (ticker/description + date + band) against an independent structured dataset; agreement recorded in `reconciled_sources`, divergence flags review (`reconcile` stage).
- **Idempotency:** SHA-256 of PDF bytes; UNID dedupe — re-polling never re-ingests.
- **Digital signature:** *presence* of the embedded OGE PKCS#7 signature is detected and recorded; full cryptographic chain verification is deferred (`signature_verified` stays null until implemented).

A filing scoring below the confidence threshold (0.7) is stored but **withheld from the public view** — list pages, detail pages, and the API all enforce the public-status gate — and surfaced in the operator review queue (FR-O3).

### 4.3 Amount bands

The form prints literal dollar ranges (the legacy A–J letters are conceptual lineage only). Store the raw range string, a normalized band index `1..10`, and `amount_min`/`amount_max` integers:

| Band | Range | min | max |
|---|---|---|---|
| 1 | $1,001–$15,000 | 1001 | 15000 |
| 2 | $15,001–$50,000 | 15001 | 50000 |
| 3 | $50,001–$100,000 | 50001 | 100000 |
| 4 | $100,001–$250,000 | 100001 | 250000 |
| 5 | $250,001–$500,000 | 250001 | 500000 |
| 6 | $500,001–$1,000,000 | 500001 | 1000000 |
| 7 | $1,000,001–$5,000,000 | 1000001 | 5000000 |
| 8 | $5,000,001–$25,000,000 | 5000001 | 25000000 |
| 9 | $25,000,001–$50,000,000 | 25000001 | 50000000 |
| 10 | Over $50,000,000 | 50000001 | NULL |

UI displays the range; aggregate "estimated value" uses band midpoints and is always shown *as a range*, never a point figure.

---

## 5. Database Schema

PostgreSQL on Neon. Typed node tables for integrity + one polymorphic `edges` table for the knowledge graph. UUID primary keys. All timestamps `TIMESTAMPTZ`.

### 5.1 Core entity tables

```sql
-- People / filers (extensible beyond the President)
CREATE TABLE persons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL,              -- 'President', 'Cabinet', ...
  term_start    DATE,
  term_end      DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Companies / securities issuers
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  ticker          TEXT,
  cik             TEXT,                     -- SEC EDGAR CIK
  figi            TEXT,
  parent_id       UUID REFERENCES companies(id),
  sector          TEXT,                     -- GICS sector
  industry        TEXT,                     -- GICS industry
  aliases         TEXT[],                   -- brands, subsidiaries, products
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ticker)
);

-- Filings (one per source PDF)
CREATE TABLE filings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id           UUID REFERENCES persons(id),
  form_type           TEXT NOT NULL,        -- '278-T', '278e'
  oge_unid            TEXT UNIQUE,          -- Domino UNID
  filing_date         DATE NOT NULL,
  report_period_start DATE,
  report_period_end   DATE,
  source_url          TEXT NOT NULL,
  source_domain       TEXT,
  pdf_hash            TEXT UNIQUE NOT NULL, -- SHA-256
  raw_pdf_path        TEXT,
  page_count          INTEGER,
  transaction_count   INTEGER,
  signature_verified  BOOLEAN,
  parse_method        TEXT,                 -- 'consensus' | 'llm_adjudicated'
  parse_confidence    REAL,                 -- 0..1
  status              TEXT DEFAULT 'pending', -- pending|parsed|review|published
  version             INTEGER DEFAULT 1,
  supersedes_id       UUID REFERENCES filings(id),
  parsed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (individual disclosed trades)
CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id           UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  person_id           UUID REFERENCES persons(id),
  company_id          UUID REFERENCES companies(id),
  row_number          INTEGER NOT NULL,
  source_page         INTEGER,
  description_raw     TEXT NOT NULL,        -- verbatim Description cell
  transaction_type    TEXT NOT NULL,        -- Purchase|Sale|Sale (Partial)|Exchange
  transaction_date    DATE NOT NULL,        -- the analytically important date
  disclosure_date     DATE,                 -- = filing_date; "publicly knowable" date
  notification_late   BOOLEAN DEFAULT FALSE,
  amount_band         SMALLINT NOT NULL,    -- 1..10
  amount_min          BIGINT NOT NULL,
  amount_max          BIGINT,
  security_type       TEXT,                 -- Stock|ETF|Bond|Option
  owner               TEXT,                 -- Filer|Spouse|Dependent if determinable
  price_at_txn        REAL,
  price_current       REAL,
  price_current_date  DATE,
  gain_loss_pct       REAL,
  row_confidence      REAL,                 -- 0..1
  reconciled_sources  TEXT[],               -- ['propublica','quiver']
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Statements (the President's public utterances)
CREATE TABLE statements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          UUID REFERENCES persons(id),
  spoken_at          DATE NOT NULL,
  channel            TEXT,                  -- 'remarks'|'interview'|'truth_social'|...
  venue              TEXT,
  full_text          TEXT NOT NULL,
  source             TEXT NOT NULL,         -- 'app'|'cpd'|'truth_social'|'caption'
  source_url         TEXT NOT NULL,
  source_ref         TEXT,                  -- DCPD package id, post id, video id
  attribution_method TEXT NOT NULL,         -- official_transcript|caption_derived
  attribution_conf   REAL NOT NULL,         -- for caption_derived: speaker-segmentation confidence
  needs_review       BOOLEAN DEFAULT FALSE,
  -- embedding VECTOR(1536) — deferred: v1 dedupes by content_hash; pgvector
  -- embeddings return with semantic search (see §2 Embeddings row).
  content_hash       TEXT UNIQUE,
  superseded_by      UUID REFERENCES statements(id),  -- CPD upgrade of a faster source
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Detected company/sector mentions inside statements
CREATE TABLE statement_mentions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id  UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id),
  sector        TEXT,
  exact_quote   TEXT NOT NULL,             -- verbatim span, verified present in full_text
  char_start    INTEGER NOT NULL,
  char_end      INTEGER NOT NULL,
  sentiment     TEXT,                      -- positive|negative|neutral
  stance        TEXT,                      -- praise|threat|policy|tariff|...
  confidence    REAL NOT NULL,
  method        TEXT NOT NULL,             -- gazetteer|ner|llm
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Official government actions
CREATE TABLE actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   TEXT NOT NULL,             -- executive_order|proclamation|tariff|contract|rule
  occurred_on   DATE NOT NULL,
  signed_on     DATE,
  title         TEXT NOT NULL,
  summary       TEXT,
  source        TEXT NOT NULL,             -- 'federal_register'|'usaspending'|'regulations'
  source_ref    TEXT,                      -- FR document number / award id
  source_url    TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Which companies/sectors an action affects
CREATE TABLE action_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id),
  sector       TEXT,
  link_method  TEXT NOT NULL,              -- named|sector|contract_recipient
  confidence   REAL NOT NULL
);
```

### 5.2 Correlations (materialized by the scoring job)

```sql
CREATE TABLE correlations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  event_kind      TEXT NOT NULL,           -- 'statement' | 'action'
  statement_id    UUID REFERENCES statements(id),
  action_id       UUID REFERENCES actions(id),
  days_gap        INTEGER NOT NULL,        -- event_date - transaction_date (signed)
  signal_score    REAL NOT NULL,          -- 0..100 composite
  components      JSONB NOT NULL,         -- every component value (auditable)
  scoring_version TEXT NOT NULL,          -- methodology version
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK ((statement_id IS NOT NULL) <> (action_id IS NOT NULL))
);
```

### 5.3 Knowledge graph layer

Node tables above stay authoritative; the graph is one polymorphic edge table plus a materialized node projection for fast rendering.

```sql
CREATE TABLE graph_edges (
  id          BIGSERIAL PRIMARY KEY,
  src_type    TEXT NOT NULL,   -- person|company|sector|trade|statement|action|filing
  src_id      UUID NOT NULL,
  dst_type    TEXT NOT NULL,
  dst_id      UUID NOT NULL,
  rel_type    TEXT NOT NULL,   -- TRADED|MENTIONS|AFFECTS|IN_SECTOR|SIGNED|FILED|CORRELATES_WITH
  weight      NUMERIC,         -- signal_score for CORRELATES_WITH edges
  properties  JSONB,           -- score components, days_gap, direction
  valid_from  DATE,
  valid_to    DATE
);
CREATE INDEX idx_edges_src ON graph_edges (src_type, src_id);
CREATE INDEX idx_edges_dst ON graph_edges (dst_type, dst_id);
CREATE INDEX idx_edges_rel ON graph_edges (rel_type);
CREATE INDEX idx_edges_props ON graph_edges USING GIN (properties);
```

The graph-build pipeline stage truncates and rebuilds `graph_edges` from the authoritative tables each run (idempotent). A bounded recursive CTE (depth ≤ 3, visited-set cycle guard, `LIMIT`) serves graph neighborhoods to the frontend as `{nodes, links}`.

### 5.4 Operational tables

```sql
CREATE TABLE ingestion_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage         TEXT NOT NULL,    -- discover|fetch|parse|enrich|correlate|graph
  started_at    TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  items_found   INTEGER DEFAULT 0,
  items_failed  INTEGER DEFAULT 0,
  errors        JSONB,
  status        TEXT DEFAULT 'running'      -- running|completed|failed
);

CREATE TABLE price_cache (
  ticker      TEXT NOT NULL,
  price_date  DATE NOT NULL,
  close_price REAL NOT NULL,
  fetched_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, price_date)
);

CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash    TEXT UNIQUE NOT NULL,         -- SHA-256 of the issued key
  label       TEXT,
  rate_limit  INTEGER DEFAULT 1000,         -- requests/day
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);
```

### 5.5 Indexes (beyond PKs/uniques)

```sql
CREATE INDEX idx_txn_company   ON transactions (company_id);
CREATE INDEX idx_txn_date      ON transactions (transaction_date);
CREATE INDEX idx_txn_filing    ON transactions (filing_id);
CREATE INDEX idx_stmt_date     ON statements (spoken_at);
CREATE INDEX idx_mention_co    ON statement_mentions (company_id);
CREATE INDEX idx_action_date   ON actions (occurred_on);
CREATE INDEX idx_corr_txn      ON correlations (transaction_id);
CREATE INDEX idx_corr_score    ON correlations (signal_score DESC);
CREATE INDEX idx_stmt_embed    ON statements USING ivfflat (embedding vector_cosine_ops);
```

---

## 6. Correlation Engine

### 6.1 Candidate generation

For each transaction `T` (company `X`, transaction date `D`):
1. Resolve `X` → company, parent, sector(s), policy topics.
2. Window: `[D − 45d, D + 30d]` (asymmetric — a trade *preceding* an action is a stronger signal than one reacting to it; window is configurable).
3. Collect candidate statements (via `statement_mentions` touching `X` or its sector) and candidate actions (via `action_targets`) inside the window.

### 6.2 Scoring model — "Potential Conflict Signal" (0–100), v1.1

Composite weighted sum; **every component is stored in `correlations.components` JSONB and displayed in the UI**. The model lives in `src/lib/scoring.ts` — the methodology page renders the weights from the same constants the engine uses, so the published model can never drift from the executed one.

| Component | Definition | Weight (v1.1) |
|---|---|---|
| `temporalProximity` | `exp(-|days_gap| / τ)`, τ = 14 days | 0.35 |
| `entitySpecificity` | direct issuer mention 1.0 · sub-industry topic match 0.6 (`src/pipeline/lib/topics.ts`) | 0.25 |
| `authority` | the filer's policy power over the traded company, from `persons.authority` (President 1.0) | 0.15 |
| `tradeMagnitude` | log-normalized band midpoint, 0..1 | 0.10 |
| `corroboration` | bonus for multiple distinct in-window events: `(events − 1) × 0.25`, capped at 1 | 0.15 |

`signal_score = 100 × Σ wᵢ·componentᵢ`. Weights are versioned (`scoring_version`), published on the methodology page, and changelogged (`SCORING_CHANGELOG`). Only pairs above a threshold (default 25) become `CORRELATES_WITH` graph edges.

**Deliberately excluded (v1.1):** `directional_consistency` — whether the trade's direction aligns with the event's expected price impact. v1.0 carried it as a hardcoded 0.5 placeholder, which rendered as a flat half-marks bar implying analysis that did not occur; it was removed rather than faked, and returns when price-impact direction modelling lands.

Re-scoring **upserts** on the unique (transaction, event_kind, statement, action) pair and prunes stale pairs by a `refreshed_at` stamp — it never truncates, so `verified_genuine` verdicts (LLM or human) survive every run.

### 6.3 Framing discipline

The score is presented as an **analytical index**, never a verdict. UI copy: "This trade scored high on temporal proximity and entity specificity." Each correlation panel carries the standing disclaimer (PRD §8.2). The score is multi-axis by construction so it cannot be read as a single "guilt number."

---

## 7. Web Application

### 7.1 Routes (Next.js App Router)

```
app/
  page.tsx                     Dashboard
  trades/page.tsx              Searchable/sortable/filterable trades table
  trades/[id]/page.tsx         Trade detail + correlation panel
  companies/[ticker]/page.tsx  All trades + statements + actions for a company
  filings/page.tsx             All filings
  filings/[id]/page.tsx        Filing detail + source PDF link
  timeline/page.tsx            Multi-lane interactive timeline
  graph/page.tsx               Force-directed knowledge graph
  methodology/page.tsx         Methodology, sources, scoring weights, disclaimers
  api-docs/page.tsx            Interactive API documentation
  api/v1/...                   Public REST API (route handlers)
  api/cron/heartbeat/route.ts  Optional Vercel Cron → triggers GH workflow_dispatch
```

### 7.2 Rendering strategy

- Dashboard, company, filing, methodology pages: **ISR** (revalidate after each pipeline run, e.g. hourly tag-based revalidation). Data changes at most daily.
- Trades table, timeline, graph: client components fetching `/api/v1/*`; precomputed data keeps payloads small.
- Graph: client renders `react-force-graph`; the `/api/v1/graph` handler runs a bounded recursive CTE and returns `{nodes, links}`; lazy expansion on node click.

### 7.3 Public API (`/api/v1`)

| Endpoint | Description |
|---|---|
| `GET /transactions` | Filter by company/ticker, type, date range, amount band; sort; paginate. |
| `GET /transactions/:id` | One trade + its correlations. |
| `GET /filings`, `GET /filings/:id` | Filing metadata + rows. |
| `GET /statements` | Filter by date, channel, mentioned company. |
| `GET /actions` | Filter by type, date, affected company. |
| `GET /correlations` | Filter by transaction, min score, event kind. |
| `GET /companies/:ticker` | Company profile + aggregates. |
| `GET /graph?node=&depth=` | Bounded graph neighborhood as `{nodes, links}`. |
| `GET /export/transactions.ndjson` | Bulk snapshot for researchers. |

All responses: consistent envelope `{ data, meta: { total, page, last_updated } }`. Auth: `X-API-Key` header → SHA-256 → `api_keys` lookup → per-key daily rate limit. OpenAPI spec served at `/api/v1/openapi.json`.

---

## 8. Pipeline Orchestration

A single GitHub Actions workflow, scheduled daily, runs the stages sequentially. Each stage is a job that writes to Neon and can be re-run independently (idempotent). Stage failure does not roll back prior stages.

| Stage | Runtime | Action |
|---|---|---|
| `discover` | Node | Poll OGE JSON view + statement/action source feeds; diff against ingested IDs; write new pending records. |
| `fetch` | Node | Download new PDFs/feeds; hash; dedupe; mirror raw payloads. |
| `parse` | Python | camelot + pdfplumber + Claude adjudicator → `transactions`; run validation gate. |
| `ingest-statements` | Python | APP scrape + CPD API + Truth feed → `statements`; reconcile CPD upgrades. |
| `ingest-actions` | Node | Federal Register + USAspending → `actions` + `action_targets`. |
| `enrich` | Python | Ticker resolution; price fetch; mention detection (gazetteer→NER→LLM, quote-span verified); embeddings. |
| `correlate` | Node | Candidate generation + scoring → `correlations`. |
| `graph-build` | Node | Rebuild `graph_edges` + node projection. |
| `revalidate` | — | Ping Vercel revalidation webhook to refresh ISR pages. |

Every stage opens an `ingestion_runs` row. A failed stage alerts (GitHub Actions notification / optional webhook). Vercel Cron optionally fires `workflow_dispatch` as a redundant trigger.

---

## 9. Cost Model

| Component | Plan | Monthly |
|---|---|---|
| Vercel (Next.js app + API) | Hobby | $0 |
| GitHub Actions (pipeline, public repo) | Free, unlimited | $0 |
| Neon Postgres (< 100k rows, pgvector, scale-to-zero) | Free | $0 |
| LLM (Claude — adjudication + mention extraction + caption speaker-segmentation, cached + pre-filtered) | Pay-per-token | ~$1–15 |
| Caption retrieval (Supadata free tier) | Free | $0 |
| Tiingo / FMP / EDGAR / govinfo / Federal Register / USAspending / ProPublica | Free tiers | $0 |
| **Total** | | **~$1–15/month** (LLM tokens only) |

This is a **strictly free-tier** infrastructure design (v1 decision): no paid data subscriptions. Trade reconciliation uses the free ProPublica dataset only; Quiver's paid API is deferred to a later version. No audio-transcription service is used — caption retrieval fetches existing transcripts.

Upgrade triggers: Neon > 0.5 GB or > 100 CU-hr/mo; needing sub-daily pipeline cadence (→ Vercel Workflows or GH cron tightening); Vercel Hobby commercial-use limits (a public civic project is generally fine — verify against Hobby terms).

---

## 10. Security, Integrity & Compliance

- **Secrets** (Anthropic key, Neon URL, api.data.gov key, Tiingo/FMP keys) live in GitHub Actions secrets and Vercel environment variables — never in the repo.
- **DB access:** pipeline uses a write role; the web app uses a read-only role. Always the **pooled** Neon connection string from serverless contexts.
- **API keys** stored only as SHA-256 hashes; per-key rate limiting; revocable.
- **Provenance integrity:** raw PDFs and raw feed payloads are retained; filings/statements/actions immutable; corrections create new versions linked via `supersedes_id`/`superseded_by`.
- **Permitted-use compliance:** disclosure data used solely for news/transparency dissemination; About page states purpose; no credit-rating/solicitation/non-media-commercial use.
- **Source politeness:** descriptive User-Agent + contact email; rate limits per source; robots.txt honored; fragile feeds mirrored on ingest.

---

## 11. Extensibility

- **New filer** = a row in `persons` + a parser profile + source-feed config. Schema unchanged.
- **New form type** (e.g. congressional PTR) = a new parser profile module; `filings.form_type` already free-text; OCR stage added only for image PDFs.
- **New action source** = a new `ingest-actions` adapter writing `actions`/`action_targets`.
- **Graph** is type-agnostic — new node/edge types need no DDL.
- **Lobbying / FEC modules** plug in as additional node tables + edge types feeding the same correlation engine.
