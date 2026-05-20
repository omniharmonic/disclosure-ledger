# Product Requirements Document — Presidential Conflict-of-Interest Tracker

*Working codename: `disclosure-ledger`*
*Project by Benjamin Life (@omniharmonic) · OpenCivics*
*Version 1.0 — May 2026*

> **Companion documents:** [ARCHITECTURE.md](./ARCHITECTURE.md) (technical architecture) · [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (build sequence). This PRD owns *what* and *why*; the other two own *how* and *when*.

---

## 1. Summary

A public-interest web platform that builds, maintains, and publishes the most rigorous structured record of the sitting President's disclosed securities transactions, and correlates each transaction with his contemporaneous public statements and official government actions affecting those same companies and sectors.

The product fills a documented accountability gap: federal ethics regulators publish disclosures as inert PDFs and do not proactively analyze them for conflicts of interest or emoluments concerns. This platform converts those primary sources into ironclad structured data, layers in a verifiable record of what the President said and did about the companies he traded, and presents the resulting timeline and relationship graph in a way the public can explore.

The platform is **descriptive, not accusatory**. It surfaces facts, timelines, and transparently-scored correlations. It never asserts illegality.

---

## 2. Problem Statement

### 2.1 The accountability gap

1. **Primary sources are inaccessible by design.** Presidential financial disclosures live as PDFs inside a 1990s-era Lotus Notes/Domino application. There is no official structured dataset, no API, no analysis layer.
2. **Disclosure ≠ scrutiny.** The Office of Government Ethics (OGE) certifies filings for completeness but does not investigate whether trades coincide with policy actions that move the traded stocks. No federal body performs that correlation.
3. **The record of statements is being actively degraded.** In May 2025 the White House removed all verbatim transcripts of presidential remarks from whitehouse.gov and deleted the historical archive. The canonical public record of what the President says is now fragmented across independent archives.
4. **Existing trackers stop at the trade.** Quiver Quantitative, Capitol Trades, and Unusual Whales surface *that* a trade happened. None build the evidentiary paper trail connecting a trade to the President's own words and official acts about that company.

### 2.2 What this product does that nothing else does

It produces, for each disclosed transaction, a **defensible, source-linked timeline**: what the President bought or sold, when, and — in a window around that date — what he publicly said about the company or its sector, and what official actions his administration took affecting it. It then makes that timeline explorable as tables, timelines, and a relationship graph, and exposes the underlying structured data via a public API.

---

## 3. Goals & Non-Goals

### 3.1 Goals

| # | Goal | Success measure |
|---|---|---|
| G1 | **Ironclad trade data.** Every transaction in every Trump 278-T/278e filing extracted into validated structured records. | 100% of filings ingested; ≥99.5% of rows pass automated validation; every row traceable to a source PDF page. |
| G2 | **Comprehensive statement record.** A continuously-updated, attribution-verified corpus of the President's public statements. | Daily ingestion from ≥3 sources; every statement marked single-speaker-verified or flagged. |
| G3 | **Official-action record.** Executive orders, proclamations, rules, tariffs, and federal contract awards relevant to traded companies. | Federal Register + USAspending ingested daily; actions linked to affected companies/sectors. |
| G4 | **Transparent correlation.** Each (trade ↔ statement) and (trade ↔ action) pair scored by a published, multi-component methodology. | Every correlation displays its score breakdown and primary-source citations. |
| G5 | **Compelling public exploration.** Timeline, relationship graph, dashboards, and searchable tables. | A non-expert can answer "what did he say about NVIDIA before he bought it?" in under 60 seconds. |
| G6 | **Open data.** A public, documented, rate-limited read API. | Any developer can query the structured dataset; full methodology is public. |
| G7 | **Cheap and durable.** Runs at near-zero infrastructure cost and self-updates without manual intervention. | < $20/month all-in; no manual step in the daily update path. |
| G8 | **Extensible.** Architecture supports adding Cabinet members, Congress, and other officials without a rewrite. | New filer = configuration + parser profile, not new schema. |

### 3.2 Non-Goals (v1)

- **Not** financial advice or a trading signal product.
- **Not** a legal determination engine — it never outputs "illegal," "insider trading," or "corruption" as factual claims.
- **Not** real-time market data — end-of-day prices are sufficient (trades are dated, not timed).
- **Not** Congress or Cabinet coverage in v1 (architecture supports it; scope excludes it).
- **Not** user accounts, comments, or social features in v1 (API keys are the only credential).
- **Not** a general-purpose speech archive — statement ingestion is scoped to material plausibly relevant to traded companies/sectors.

---

## 4. Users & Use Cases

### 4.1 Primary personas

| Persona | Need | Key journeys |
|---|---|---|
| **Journalist / researcher** | Verifiable, citable facts and an evidence trail. | Find every trade in a company; pull the source PDF; see statements/actions around a trade; export/cite. |
| **Watchdog / civic org (CREW, CLC, academics)** | Bulk structured data and methodology transparency. | Use the API; audit the scoring methodology; cross-reference with their own datasets. |
| **Informed citizen** | A legible, trustworthy way to "see the conflicts." | Browse the dashboard; explore the timeline; click a graph node and follow the story. |
| **Developer / data journalist** | Programmatic access. | Query `/api/v1/*`; build derivative visualizations. |

### 4.2 Representative use cases

- **UC1 — Trade lookup:** "Show me every NVIDIA transaction the President disclosed, with the source filing for each."
- **UC2 — Statement correlation:** "He bought Palantir on Feb 3. What did he say about Palantir, defense, or AI in the 45 days before and 30 days after?"
- **UC3 — Action correlation:** "Did any executive order, tariff, or federal contract affecting this company land near this trade?"
- **UC4 — Sector view:** "Which sectors does his disclosed portfolio concentrate in, and which had the most policy activity?"
- **UC5 — Graph exploration:** "Start at the President node, expand to companies, expand a company to its trades, statements, and actions."
- **UC6 — Timeline scrub:** "Play the year as a timeline: trades on one lane, statements on another, official actions on a third."
- **UC7 — Filing audit:** "Open the May 8 2026 filing, see all 1,800+ rows, and verify them against the original PDF."
- **UC8 — API pull:** "Download all 2026 transactions as JSON for my own analysis."

---

## 5. Functional Requirements

### 5.1 Data ingestion — Trades

- **FR-T1** Discover new presidential filings by polling the OGE Domino view as JSON (`PAS+Index?ReadViewEntries&OutputFormat=JSON`); no headless browser.
- **FR-T2** Download each filing PDF; compute a SHA-256 content hash; deduplicate against prior ingests.
- **FR-T3** Verify each PDF's embedded OGE digital signature where present; record verification status as provenance.
- **FR-T4** Extract every transaction row: row number, description, type, transaction date, late-notification flag, amount band, and band min/max dollar values.
- **FR-T5** Validate every extraction (sequential row numbers, page-count reconciliation, enum membership, date sanity). Flag any filing below confidence threshold for human review.
- **FR-T6** Resolve each security description to a ticker, company, sector, and industry.
- **FR-T7** Enrich each transaction with end-of-day price on the transaction date and a current price, and compute performance since the trade.
- **FR-T8** Cross-reconcile extracted trades against ≥1 independent structured dataset (ProPublica and/or Quiver) and record agreement/divergence.

### 5.2 Data ingestion — Statements

- **FR-S1** Ingest the President's public statements daily from a prioritized source waterfall (American Presidency Project for timeliness; govinfo Compilation of Presidential Documents as authoritative backfill/correction; Truth Social feed; whitehouse.gov as a discovery index; for events covered only on video, retrieve *existing* captions/transcripts from canonical channels — C-SPAN, official YouTube — via a caption-retrieval service, with no audio processing performed by this platform).
- **FR-S2** Record per statement: verbatim text, date, channel/venue, source URL, and an **attribution method** (`official_transcript`, `caption_derived`) with a confidence score.
- **FR-S3** Only `official_transcript`-sourced statements are auto-trusted for correlation. `caption_derived` statements are first passed through a text-only LLM speaker-segmentation step that isolates the President's spans from other speakers (reporters, aides); only spans above a speaker-attribution confidence threshold may form correlation edges, and the rest are flagged for review.
- **FR-S4** Detect company/sector/ticker mentions within each statement via a layered pipeline (gazetteer → NER → LLM extraction), and store the **exact verbatim quote span and character offsets** for every detected mention.
- **FR-S5** Programmatically verify every LLM-extracted quote span exists in the source text; reject hallucinated spans.
- **FR-S6** When govinfo CPD later publishes an event already ingested from a faster source, reconcile and upgrade the record to the official text.

### 5.3 Data ingestion — Official Actions

- **FR-A1** Ingest presidential documents (executive orders, proclamations, memoranda) and relevant rules from the Federal Register API daily.
- **FR-A2** Ingest federal contract/grant awards from the USAspending API, filterable to companies in the traded universe.
- **FR-A3** Link each action to the companies and/or sectors it affects, with the linkage method recorded.

### 5.4 Correlation engine

- **FR-C1** For each trade, identify candidate statements and actions within a configurable window (default: 45 days before, 30 days after the **transaction date**).
- **FR-C2** Score each (trade ↔ event) pair with a transparent, multi-component model (temporal proximity, entity specificity, authority, directional consistency, trade magnitude, corroboration) yielding a 0–100 **Potential Conflict Signal**.
- **FR-C3** Persist the score and **every component value** so the reasoning is fully auditable and displayable.
- **FR-C4** Materialize correlations above a threshold as graph edges; never recompute at request time.
- **FR-C5** Use the **transaction date** for all scoring; use the **disclosure date** only for "what was publicly knowable" framing. Store transaction, disclosure, and ingestion dates separately.

### 5.5 Public web application

- **FR-W1 — Dashboard:** headline stats (transaction count, estimated value range, date coverage, last/next expected filing), top holdings, sector breakdown, recent trades, gain/loss leaders.
- **FR-W2 — Trades table:** full searchable, sortable, filterable table; amounts shown as ranges ("$1M – $5M"), never implied exact figures.
- **FR-W3 — Trade detail:** one transaction with its full correlation panel (linked statements and actions, each with score breakdown and source link).
- **FR-W4 — Company page:** all transactions in a company, position timeline, price chart with buy/sell markers, all linked statements and actions.
- **FR-W5 — Filing page:** filing metadata, all rows, link to source PDF, parse method and confidence.
- **FR-W6 — Timeline view:** multi-lane interactive timeline (trades / statements / actions) with zoom, pan, and filtering.
- **FR-W7 — Graph view:** interactive force-directed knowledge graph of People, Companies, Sectors, Trades, Statements, Actions, Filings; lazy node expansion.
- **FR-W8 — Methodology/About page:** plain-language explanation of the 278-T form, the STOCK Act / Ethics in Government Act, amount bands, sources, the scoring methodology with weights, parser confidence, attribution, and disclaimers.
- **FR-W9** Every data point on every page links to its primary source.

### 5.6 Public API

- **FR-API1** Read-only REST API under `/api/v1/` for filings, transactions, statements, actions, correlations, and graph neighborhoods.
- **FR-API2** API-key authentication with per-key rate limiting; documented limits.
- **FR-API3** Cursor or page-based pagination; consistent JSON envelope with metadata (last-updated, totals).
- **FR-API4** OpenAPI specification published; interactive docs page.
- **FR-API5** Bulk dataset export (newline-delimited JSON / CSV snapshots) for researchers.

### 5.7 Operations & integrity

- **FR-O1** Every ingestion run is logged (source, start/end, items found, errors, status).
- **FR-O2** Filings, statements, and actions are immutable once ingested; corrections create new versions rather than overwriting.
- **FR-O3** A low-confidence/needs-review queue is surfaced to an operator.
- **FR-O4** The daily pipeline runs unattended and alerts on failure.

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Accuracy** | Trade extraction is the product's credibility floor. ≥99.5% automated row-validation pass rate; any filing below threshold is withheld from the public view until reviewed. |
| **Provenance** | Every public datum links to a primary source. No datum exists without a recorded origin. |
| **Attribution integrity** | No statement is attributed to the President without a verified single-speaker source or an explicit confidence flag. This platform performs no audio processing/ASR — caption-derived text comes from existing transcripts and is speaker-segmented by a text-only LLM step. Misattribution is the highest-severity defect class. |
| **Neutral framing** | UI and API copy use "potential conflict signal," "timing correlation," "appearance of conflict" — never "insider trading," "corruption," or "illegal" as factual assertions. |
| **Performance** | Dashboard and table pages interactive in < 2s on a typical connection; graph renders thousands of nodes smoothly via lazy expansion. |
| **Cost** | All-in infrastructure < $20/month at v1 scale; architecture keeps the web tier on free/hobby plans. |
| **Reliability** | Daily pipeline is durable — a failed stage retries without re-running successful stages; partial failure never corrupts the dataset. |
| **Legality** | Disclosure data used solely for news/transparency dissemination (the permitted exception under 5 U.S.C. § 13107(c)); never for credit rating, solicitation, or non-media commercial use. Respect robots.txt and source rate limits. |
| **Accessibility** | WCAG 2.1 AA; the timeline and graph have accessible tabular equivalents. |
| **Transparency of method** | The scoring methodology, parser approach, and source waterfall are fully public and versioned. |
| **Extensibility** | Adding a new filer is configuration + a parser profile, not a schema change. |

---

## 7. Data Sources of Record

| Domain | Primary source | Role | Secondary / validation |
|---|---|---|---|
| Trades | OGE `Presiden.nsf` Domino view (JSON) + signed PDFs | Ground truth | ProPublica Trump disclosures (free), Quiver API (paid, optional) |
| Statements | American Presidency Project (timely); govinfo CPD API (authoritative) | Ground truth | Truth Social feed; whitehouse.gov (discovery only); C-SPAN / official YouTube captions via caption-retrieval service (flagged `caption_derived`) |
| Official actions | Federal Register API; USAspending API | Ground truth | Regulations.gov (optional) |
| Tickers | SEC EDGAR `company_tickers.json` | Resolution | OpenFIGI (fallback) |
| Prices | Tiingo (EOD) | Enrichment | Financial Modeling Prep (cross-check) |

Detailed endpoints, rate limits, and access patterns are in [ARCHITECTURE.md §3](./ARCHITECTURE.md).

---

## 8. Legal, Ethical & Editorial Constraints

1. **Permitted-use compliance.** OGE disclosure data is used exclusively for transparency/news dissemination to the general public. The About page states this purpose explicitly. No credit-rating, solicitation, or non-media commercial use.
2. **Defamation discipline.** The platform publishes *verifiable facts and transparently-scored correlations*. It states underlying facts and lets readers infer; it never asserts intent or criminality. A prominent, ProPublica-style disclaimer appears wherever correlations are shown: *no evidence presented establishes that any trade used nonpublic information; correlation is not causation; lawful trading is lawful.*
3. **Amount-range honesty.** Disclosure amounts are statutory bands, not exact figures, and are always displayed as ranges.
4. **Disclosure-lag honesty.** The 30–45 day reporting lag, late filings, and amended filings are surfaced as data-quality fields, not hidden.
5. **Source politeness.** Rate-limit all sources; identify the crawler with a descriptive User-Agent and contact email; honor robots.txt; mirror fragile third-party feeds on ingest.
6. **Methodology in the open.** Scoring weights and parser methodology are public and versioned; changes are changelogged.

---

## 9. Release Plan & Acceptance

| Milestone | Scope | Acceptance gate |
|---|---|---|
| **M1 — Trade spine** | All known Trump filings ingested, parsed, validated, enriched; trades table + filing pages live. | Every known filing parsed; row validation ≥99.5%; trades reconcile with ProPublica. |
| **M2 — Statements & actions** | Statement and action ingestion live; mention detection with verified quote spans. | ≥3 statement sources ingesting daily; every statement has an attribution method; actions linked to companies. |
| **M3 — Correlation & exploration** | Correlation engine; dashboard, company pages, timeline, graph. | Every trade detail page shows scored, source-linked correlations; graph and timeline interactive. |
| **M4 — Open data & polish** | Public API + docs; methodology page; mobile; SEO; automation hardened. | API documented and rate-limited; pipeline runs unattended for 7 days with zero manual intervention. |

A milestone is **done** only when its data is provenance-complete (every datum source-linked) and the pipeline producing it is automated.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| OGE Domino view changes or `?ReadViewEntries` is disabled | Loss of discovery | Fall back to White House PDF monitoring + known-URL polling; alert on discovery failure. |
| A filing arrives as a non-standard layout / attached schedule | Parser misses rows | Multi-extractor consensus + LLM adjudicator; page-count reconciliation forces detection; low-confidence filings withheld pending review. |
| Statement misattribution (other speaker → Trump) | Credibility / legal harm | Prefer single-speaker official sources; `caption_derived` content passes LLM speaker-segmentation and is gated by speaker-attribution confidence before auto-correlation. |
| Fragile third-party feeds (Truth Social JSON, APP scrape) break | Statement gap | Mirror raw payloads on ingest; multiple sources; monitor and alert. |
| Correlation framing perceived as accusation | Legal / reputational | Strict neutral-language rules; mandatory disclaimers; published methodology; facts-not-conclusions discipline enforced in copy review. |
| yfinance / free price APIs degrade | Enrichment gaps | EOD-only need; Tiingo primary + FMP fallback; prices are non-blocking enrichment. |
| LLM extraction cost grows with volume | Budget creep | Cheap gazetteer/NER pre-filter gates LLM calls; cache by content hash; batch. |

---

## 11. Future Scope (post-v1)

- Cabinet and senior executive-branch officials (same OGE portal, same forms).
- Members of Congress (House/Senate PTRs — image PDFs, OCR required, different schema).
- Lobbying-record overlap (the Quiver "conflicted" model: bill ↔ lobbying ↔ trade).
- Campaign-finance linkage via the FEC API.
- Email/RSS alerting on new filings and high-signal correlations.
- Embeddable widgets for newsrooms.
