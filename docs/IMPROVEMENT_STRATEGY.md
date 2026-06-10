# Production Evaluation & Improvement Strategy

*disclosure-ledger · evaluated against PRD v1.0, ARCHITECTURE v1.0, IMPLEMENTATION_PLAN v1.0*
*Evaluation date: June 9, 2026*

This document records a full evaluation of the repository against the PRD — performed with
**real execution**, not desk review — and lays out an exhaustive, prioritized improvement
strategy with code samples and file references. It is organized so each section can be
worked independently:

1. [How this evaluation was performed](#1-how-this-evaluation-was-performed)
2. [Executive summary](#2-executive-summary)
3. [PRD conformance matrix](#3-prd-conformance-matrix)
4. [Verified defects — reproduced live](#4-verified-defects--reproduced-live)
5. [Security hardening review](#5-security-hardening-review)
6. [First-principles analysis: what this product actually is](#6-first-principles-analysis)
7. [Improvement plan by workstream](#7-improvement-plan-by-workstream)
8. [Code cleanup inventory](#8-code-cleanup-inventory)
9. [Testing strategy](#9-testing-strategy)
10. [Sequenced roadmap](#10-sequenced-roadmap)

---

## 1. How this evaluation was performed

Everything below was verified by running the system, not by reading it:

- **Toolchain:** `npm run typecheck` ✅ passes · `npm test` ✅ 6/6 (but see §9 — only one
  test file exists) · `npm run build` ✅ clean production build.
- **Database:** Postgres 16 stood up locally; `drizzle-kit push` applied the schema cleanly.
- **Data:** seeded with realistic 278-T-shaped data (3 filings across `parsed` /
  `published` / `review` statuses, 14 transactions including muni bonds and an
  OCR-`Unknown` type row, 5 Truth-Social-shaped statements including a deliberate
  "southern border" false-positive trap, 3 Federal Register / White House actions).
- **Pipeline:** the real `detect-mentions → correlate → verify → graph-build` stages were
  executed against the seed via `npx tsx src/pipeline/run.ts <stage>`.
- **Backend:** every page route and API endpoint exercised with `curl` — happy paths,
  invalid UUIDs, withheld-filing IDs, SQL-metacharacter searches, `limit=99999`,
  malformed dates.
- **Frontend:** Playwright/Chromium runs at desktop (1440×900) and iPhone 13 viewports;
  full-page screenshots of all 9 routes; interaction tests (trades filter, timeline marker
  pinning, graph node click); console-error capture (zero JS errors on either viewport).
- **Targeted reproductions:** the withheld-filing leak, the duplicate-correlation bug, the
  verification-verdict wipe, and the timezone off-by-one were each reproduced with concrete
  commands (transcripts in §4).

What could **not** be tested from this environment: live ingestion from OGE / Federal
Register / CNN Truth feed / SEC EDGAR (outbound requests to those hosts are blocked by
this sandbox's network policy), Surya OCR end-to-end (model download blocked), and the
Anthropic-keyed adjudication/verification paths. Those paths were code-reviewed instead.

---

## 2. Executive summary

**What's genuinely good.** The architecture is sound and unusually well-documented; the
docs/code correspondence is high. The pipeline is staged, idempotent in intent, and logged
(`ingestion_runs`). The schema closely follows ARCHITECTURE §5. The editorial discipline is
real — the standing disclaimer is everywhere, amounts are always ranges, and the gazetteer's
precision hardening (`WEAK_SOLO_TOKENS`, cashtag-only tickers) demonstrably works: the
seeded "southern border" trap did *not* match Southern Co. The frontend is coherent,
fast (all pages < 25 ms TTFB at seed scale), renders cleanly on mobile, and produced zero
console errors under Playwright. The visual identity is distinctive and appropriate.

**Where it falls short of "production-ready."** Live testing found four defects that
directly contradict the product's *stated trust guarantees* — the things the PRD calls the
credibility floor:

| # | Defect (all reproduced — §4) | PRD promise broken |
|---|---|---|
| D1 | Transactions and filings in `review`/`pending`/`superseded` status are fully visible at `/trades/[id]` and `/filings/[id]` (and the filing's rows with them) | "any filing below threshold is **withheld from the public view**" (NFR Accuracy, FR-O3) |
| D2 | Re-running `correlate` **destroys all verification verdicts** — including the 257 human-reviewed ones from commit `34ee836` — because the stage begins with `DELETE FROM correlations` | FR-O2 immutability; the entire human-review investment is one pipeline run from gone |
| D3 | A statement mentioning a company twice (e.g. "Nvidia … $NVDA") creates **duplicate correlation rows** for the same trade↔statement pair, double-rendered on trade/company pages and inflating `corroboration` and correlation counts | FR-C2/C3 scoring integrity; visible duplicate cards undermine the "rigorous" claim |
| D4 | Price-API keys are interpolated into URLs whose failures are stringified into `ingestion_runs.errors` **and printed to GitHub Actions logs — which are public on a public repo** | ARCHITECTURE §10 "secrets … never in the repo" (public CI logs are worse) |

Beyond defects, roughly **half of the PRD's functional surface is not yet built** (§3):
no statement sources beyond Truth Social, no ProPublica reconciliation, no signature
verification, no API auth/rate-limiting/OpenAPI/export, no review-queue UI, no sitemap/SEO,
no accessibility equivalents, and a methodology page that misstates the price source and
omits the scoring weights it promises to publish. The correlation scoring model presents
six components, but three (`entitySpecificity`, `authority`, `directionalConsistency`) are
hardcoded constants — the UI renders an audit trail that implies more analysis than occurs,
which is a transparency problem for a transparency product (§6.2).

**Bottom line.** This is a strong M1+M3-skeleton at roughly the midpoint of the
implementation plan, presented with M4 polish. The path to production is: (1) fix the four
trust defects immediately, (2) make the scoring display honest, (3) finish the PRD's open-data
and statement-coverage commitments, (4) clean up the dead surface area. The detailed plan
follows.

---

## 3. PRD conformance matrix

Status: ✅ met · 🟡 partial · ❌ not built. References are to the PRD §5/§6.

### Goals

| Goal | Status | Evidence |
|---|---|---|
| G1 Ironclad trade data | 🟡 | Extraction + validation gate + confidence scoring exist and run; but no source signature verification, no cross-source reconciliation, no per-row PDF-page traceability in the UI (page stored, not linked), no parser test suite. |
| G2 Comprehensive statement record | ❌ | One source (Truth Social via CNN mirror). PRD requires ≥3 daily sources incl. APP + govinfo CPD. |
| G3 Official-action record | 🟡 | Federal Register ✅, White House scrape ✅ (but misfiled — see W-13), USAspending ❌. |
| G4 Transparent correlation | 🟡 | Components persisted & displayed ✅, but 3 of 6 are constants (§6.2); duplicate pairs (D3); verdicts wiped (D2). |
| G5 Compelling exploration | 🟡 | All surfaces exist and work; timeline lacks filtering/zoom, graph lacks lazy expansion, dashboard lacks holdings/sector/gain-loss modules. |
| G6 Open data | ❌ | 3 of ~9 endpoints; no keys, no rate limits, no OpenAPI, no export. |
| G7 Cheap & durable | 🟡 | $0 infra ✅; but provenance PDFs live only in an evictable Actions cache (W-9), and one failed stage aborts the rest of the run (W-10). |
| G8 Extensible | ✅ | New filer = seed entry + person row; schema is filer-agnostic. |

### Functional requirements (abridged to deltas)

| FR | Status | Note |
|---|---|---|
| FR-T1 OGE JSON discovery | ❌ | Replaced by curated seeds + WH monitor. Justified in `seeds.ts` (President not in `PAS+Index`) — but the PRD/architecture were never updated, and no OGE-side automated discovery exists at all. |
| FR-T2 hash dedupe | ✅ | `fetch.ts` SHA-256 + `%PDF-` magic check. |
| FR-T3 signature verification | ❌ | `filings.signature_verified` never written. |
| FR-T4/T5 extraction + gate | 🟡 | Content-anchored extractor + gate work; sequential-row check replaced by renumbering (documented), but no per-filing "declared total vs extracted" assertion beyond page count. |
| FR-T6 ticker resolution | 🟡 | EDGAR name-match works; no OpenFIGI fallback; `security_type`/`owner` never populated. |
| FR-T7 price enrichment | 🟡 | Alpha Vantage/Finnhub (architecture says Tiingo/FMP; methodology page says Stooq — three different stories, see W-15). |
| FR-T8 reconciliation | ❌ | `reconciled_sources` never populated. |
| FR-S1–S6 statements | ❌/🟡 | Truth Social only; no CPD/APP/captions; no LLM mention layer; no sentiment/stance; no embeddings; quote-span verification ✅ for the gazetteer pass. |
| FR-A1 Federal Register | ✅ | Paginated, deduped on `(source, source_ref)`. |
| FR-A2 USAspending | ❌ | Not built. |
| FR-A3 action linking | 🟡 | `named` only; no sector links; confidence hardcoded 0.6. |
| FR-C1–C5 correlation | 🟡 | Window + threshold + cap ✅; D2/D3 defects; three constant components; disclosure-date framing unused in scoring (correct) but also unused in UI framing. |
| FR-W1 dashboard | 🟡 | Stats, mix, recent, top-correlated ✅; top holdings / sector breakdown chart / gain-loss leaders ❌. |
| FR-W2/W3 trades | ✅/🟡 | Table is searchable/filterable/sortable-by-default; explicit column-sort controls absent; detail page ✅. |
| FR-W4 company page | ✅ | Trades, chart with markers, correlations, curated profiles. Strong page. |
| FR-W5 filing page | 🟡 | Exists, but leaks withheld filings (D1) and doesn't show signature status. |
| FR-W6 timeline | 🟡 | Three lanes + pinning ✅; zoom/pan(beyond scroll)/filtering ❌; statement-lane selection is non-deterministic at scale (W-6). |
| FR-W7 graph | 🟡 | Renders + inspector ✅; lazy expansion ❌ (whole graph shipped to client; full `statements`/`actions` tables loaded per request — W-7). |
| FR-W8 methodology | 🟡 | Good plain-language page, but omits the published weights, misstates the price source, and has no changelog (W-15). |
| FR-W9 source links | ✅ | Consistently present. |
| FR-API1–5 | ❌ | 3 endpoints, no auth, no rate limit, no OpenAPI, no export. `api_keys` table exists, unused. |
| FR-O1 run logging | ✅ | `withRun` wraps every stage. |
| FR-O2 immutability | ❌ | D2; also corrections-as-versions unimplemented (`supersededBy`, `version` unused). |
| FR-O3 review queue | ❌ | Status exists; no operator surface. |
| FR-O4 unattended + alerting | 🟡 | Daily cron ✅; alerting = default GH email only; one stage failure aborts the run (W-10). |

### Non-functional requirements

| NFR | Status | Note |
|---|---|---|
| Accuracy ≥99.5% | 🟡 | Threshold gate exists (0.7), but the "withheld" promise is broken by D1 and there is no measured row-validation pass-rate reporting. |
| Provenance | 🟡 | Source URLs ✅; raw PDFs only in evictable CI cache (W-9). |
| Attribution integrity | ✅* | Only single-author Truth Social is ingested, so attribution is trivially sound — by *absence of the hard sources*, not by solving them. |
| Neutral framing | ✅ | Copy audit found no accusatory language; disclaimers everywhere. (One nit: home-page kicker "Independent watchdog oversight" slightly overclaims — it's a tracker, not an oversight body.) |
| Performance < 2 s | ✅ at seed scale / 🟡 at target scale | `force-dynamic` everywhere + full-table graph loads will not hold at 1,800-row filings × tens of thousands of statements (W-7, W-16). |
| Cost < $20/mo | ✅ | |
| Reliability (stage independence) | ❌ | W-10. |
| Legality / permitted use | ✅ | Stated on methodology + footer. |
| Accessibility WCAG 2.1 AA | ❌ | Muted text #857b6d fails AA at 3.62:1 on paper / 3.98:1 on cards (measured); no tabular equivalents for timeline/graph; canvas graph is screen-reader-invisible. |
| Methodology transparency | 🟡 | W-15. |

---

## 4. Verified defects — reproduced live

### D1 — Withheld filings are publicly readable (severity: **critical — trust**)

The PRD's central accuracy promise is that low-confidence filings are *withheld from
public view*. `listTransactions`/`listFilings` honor this; the **detail** queries do not:

- `src/lib/queries.ts:122-147` — `getTransaction(id)` has no filing-status condition.
- `src/lib/queries.ts:159-168` — `getFiling(id)` has no status condition, and returns
  every transaction row of the filing.

Reproduction (seeded `review` filing): `GET /trades/<hidden-txn-id>` → **200**, full
detail rendered ("HIDDEN REVIEW ROW NVDA", band 9, source link); `GET /filings/<review-id>`
→ **200** with both withheld rows. IDs are UUIDs, but they are not secrets: they appear in
pipeline logs, and any future list-endpoint regression, sitemap, or crawl exposes them.
The same hole means **superseded duplicate filings** (the lower-quality WH scans) remain
publicly addressable forever.

**Fix** — enforce visibility in the shared query layer (never in pages), and treat
non-public as not-found:

```ts
// src/lib/queries.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  if (!UUID_RE.test(id)) return null;                       // also fixes D5 (500s)
  const rows = await db
    .select({ /* …unchanged select list… */ })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(companies, eq(transactions.companyId, companies.id))
    .where(and(
      eq(transactions.id, id),
      inArray(filings.status, [...PUBLIC_FILING_STATUSES]), // ← the missing guard
    ))
    .limit(1);
  return (rows[0] as TransactionRow) ?? null;
}

export async function getFiling(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [filing] = await db.select().from(filings)
    .where(and(eq(filings.id, id), inArray(filings.status, [...PUBLIC_FILING_STATUSES])))
    .limit(1);
  if (!filing) return null;
  /* …transactions query unchanged… */
}
```

Add the same guard to `getCorrelations` (it joins from a transaction id, so an attacker
holding a hidden transaction id can currently also read its correlations).

**Regression test to add** (`src/lib/queries.test.ts`): seed one `review` filing; assert
`getTransaction(hiddenId)`, `getFiling(reviewId)`, and `getCorrelations(hiddenId)` all
return null/empty, and that `/api/v1/*` never returns the row.

### D2 — `correlate` destroys verification verdicts (severity: **critical — data loss**)

`src/pipeline/stages/correlate.ts:90` — `await db.delete(correlations);` runs first, then
everything is re-inserted with `verifiedGenuine: null`. Reproduced:

```
UPDATE 1                       -- set one verdict (simulating the human review)
verdicts before re-run: 1
[correlate] … completed
verdicts after re-run: 0       -- verdict gone
```

Consequences: (a) commit `34ee836`'s human review of all 257 correlations is erased by the
next scheduled run; (b) `verify-correlations` then re-pays Anthropic tokens for the entire
corpus every day and may *flip* previously human-confirmed verdicts; (c) FR-O2 immutability
is violated; (d) between the `DELETE` and the inserts, the public site serves zero
correlations (no transaction wrapping).

**Fix** — delta-rebuild keyed on the natural pair identity, preserving verdicts, inside a
transaction. First add the identity constraint:

```ts
// src/db/schema.ts — correlations table indexes
(t) => [
  index("idx_corr_txn").on(t.transactionId),
  index("idx_corr_score").on(t.signalScore),
  // one row per (trade, event) pair; NULLS NOT DISTINCT so the unused
  // statement/action column can't create duplicate pairs (PG ≥15)
  uniqueIndex("uq_corr_pair")
    .on(t.transactionId, t.eventKind, t.statementId, t.actionId)
    // drizzle: .using(sql`btree`) — emit NULLS NOT DISTINCT via migration SQL
],
```

```sql
-- migration
CREATE UNIQUE INDEX uq_corr_pair
  ON correlations (transaction_id, event_kind, statement_id, action_id)
  NULLS NOT DISTINCT;
```

Then replace delete-all with upsert + prune:

```ts
// correlate.ts — instead of `await db.delete(correlations);`
const runStarted = new Date();

// per scored pair:
await db.insert(correlations).values({
  transactionId: t.id,
  eventKind: s.ev.kind,
  statementId: s.ev.kind === "statement" ? s.ev.id : null,
  actionId: s.ev.kind === "action" ? s.ev.id : null,
  daysGap: s.gap,
  signalScore: s.signal,
  components: s.components,
  scoringVersion: SCORING_VERSION,
}).onConflictDoUpdate({
  target: [correlations.transactionId, correlations.eventKind,
           correlations.statementId, correlations.actionId],
  set: {
    daysGap: s.gap,
    signalScore: s.signal,
    components: s.components,
    scoringVersion: SCORING_VERSION,
    refreshedAt: runStarted,            // new column, see below
    // verifiedGenuine / verdictReason deliberately NOT touched
  },
});

// after the loop: prune pairs that no longer qualify (statement deleted,
// window/threshold change) — these were never verified-genuine keepsakes.
await db.delete(correlations).where(lt(correlations.refreshedAt, runStarted));
```

Add `refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull()`
to the schema. `verify-correlations` already selects `WHERE verified_genuine IS NULL`, so
with verdicts preserved it becomes incremental and cheap automatically.

### D3 — Duplicate correlations per multiply-mentioned statement (severity: **high**)

`correlate.ts:113-124` joins `statement_mentions → statements`; a statement with two spans
for the same company ("Nvidia …" + "$NVDA") yields two identical candidate events.
Reproduced: the seeded NVDA statement produced **two rows at 78.5 and two at 62.3** for the
same (trade, statement) pairs; the trade and company pages visibly render the same quote
card twice; `listCompanies.correlationCount` and the home-page "most correlated" module
double-count; the `corroboration` component (`(events.length − 1) × 0.25`,
`correlate.ts:143`) is inflated by phantom corroboration.

Reproduced directly against the database:

```sql
select transaction_id, statement_id, count(*) from correlations
where statement_id is not null group by 1,2 having count(*) > 1;
--  transaction_id | statement_id | count
--  507979d1-…     | ba7f8aa6-…   |     2   ← the same pair, twice
--  ef48b845-…     | ba7f8aa6-…   |     2

select statement_id, count(*) from statement_mentions group by 1 having count(*) > 1;
--  ba7f8aa6-…  | 2     ← root cause: two spans (name + cashtag) for one statement
```

**Fix** — collapse candidate events to one per statement before scoring, and dedupe
mentions at the source. In `correlate.ts`, generate statement candidates distinctly:

```ts
const stmts = await db
  .selectDistinctOn([statements.id], { id: statements.id, date: statements.spokenAt })
  .from(statementMentions)
  .innerJoin(statements, eq(statementMentions.statementId, statements.id))
  .where(and(
    eq(statementMentions.companyId, t.companyId),
    gte(statements.spokenAt, from),
    lte(statements.spokenAt, to),
  ))
  .orderBy(statements.id);
```

Keep all spans in `statement_mentions` (they are legitimately distinct evidence for the
quote-highlighting UI), but the **correlation** is per (trade, statement), so it must be
deduped there. The `uq_corr_pair` constraint from D2 makes this defensive as well: even if
two candidate events slip through, the upsert collapses them. Re-derive `corroboration`
from the deduped event count.

### D4 — Price-API keys can reach public CI logs (severity: **critical — secret exposure**)

`src/pipeline/stages/ingest-prices.ts` builds request URLs with the key in the query
string (`…&apikey=${ALPHA_KEY}`, `…&token=${FINNHUB_KEY}`) and, on failure, pushes
`` `${ticker}: ${String(err)}` `` into `result.errors`. `fetchJson`/`politeFetch`
(`src/pipeline/lib/http.ts:62`) stringify the failing URL into the thrown `Error.message`.
That error string is then (a) written to `ingestion_runs.errors` (JSONB) and (b) printed to
stdout by `runlog.ts`. On a **public** repo, GitHub Actions logs are world-readable — so a
single Alpha Vantage/Finnhub timeout can publish the API key. The same pattern affects any
keyed URL (`DATA_GOV_API_KEY` when CPD is built).

**Fix** — never put secrets in the path, and redact before logging:

```ts
// http.ts — strip query secrets from any error/log surface
function redact(url: string): string {
  return url.replace(/([?&](?:apikey|token|api_key|key)=)[^&]+/gi, "$1***");
}
// use redact(url) in every `throw new Error(... ${url} ...)`

// ingest-prices.ts — prefer header auth where the API supports it; otherwise
// at minimum redact the ticker-only context, never the URL:
result.errors.push(`${ticker}: ${redact(String(err))}`);
```

Add a CI guard: a tiny step that greps the job log for the known key prefixes and fails the
run if found. Rotate both keys after this lands, since prior runs may already have leaked.

### D5 — Invalid identifiers return HTTP 500 and leak driver internals (severity: medium)

`GET /trades/not-a-uuid` → **500** (Postgres `invalid input syntax for type uuid`
propagates); `GET /api/v1/transactions?dateFrom=not-a-date` →
`{"error":"query failed: k: invalid input syntax for type date: \"not-a-date\""}`. Both
expose the column/driver and turn user error into a server error. The UUID guard in D1's fix
resolves the route case; the API case is fixed by input validation with the **already-installed
but entirely unused `zod`** dependency:

```ts
// src/lib/api.ts
import { z } from "zod";
export const TxnQuery = z.object({
  search: z.string().max(120).optional(),
  type: z.enum(["Purchase", "Sale", "Sale (Partial)", "Exchange"]).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bandMin: z.coerce.number().int().min(1).max(10).optional(),
  sortBy: z.enum(["date", "amount", "description"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// route.ts
const parsed = TxnQuery.safeParse(Object.fromEntries(url.searchParams));
if (!parsed.success) return apiError("invalid query parameters", 400);
// …and wrap the query body so a DB error returns a generic 500 with no driver text.
```

---

## 5. Security hardening review

No injection or secret-in-repo issues were found beyond D4: Drizzle parameterizes every
query, the `review`/`pending` withholding is correctly applied on all *list* queries, and
key-gated LLM stages are true no-ops without their keys. The remaining items:

| # | Issue | Fix |
|---|---|---|
| S-1 | **No API auth / rate limiting** (FR-API2). Endpoints are uncapped; the `api_keys` table is unused. | Hash the `X-API-Key` (SHA-256), look it up, enforce a per-key daily counter before opening the API. Until then, document the endpoints as unauthenticated and keep `limit ≤ 200` (already enforced). |
| S-2 | **Single DB role for web + pipeline.** `db/index.ts` uses one `DATABASE_URL`. Architecture §10 mandates a read-only serving role. | Add `DATABASE_URL_RO`; use it in `src/lib/queries.ts`. A serving-tier bug then cannot write. |
| S-3 | **Withheld rows reachable by direct URL** (D1) — listed here too because it is as much an access-control issue as a correctness one. | D1 fix. |
| S-4 | **Raw error leakage** (D5) at both the route and API layer. | D5 fix + generic 500 envelope. |
| S-5 | **Schema applied via `drizzle-kit push`, no committed migrations.** An "immutable, auditable" store has a non-auditable schema history; `db:migrate` points at a non-existent `src/db/migrate.ts`. | `drizzle-kit generate` committed migrations + a real `migrate.ts` runner; reserve `push` for local dev. |
| S-6 | **No security headers / CSP.** | Add `headers()` in `next.config.ts` (CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS). The graph canvas needs no inline script, so a strict CSP is feasible. |
| S-7 | **Unbounded graph payload to the client** (also a perf item, W-7). The `/api/v1/graph` handler ships the entire node+edge set and loads the full `statements`/`actions` tables per request. | Architecture's bounded recursive CTE with depth + LIMIT; lazy expansion on the client. |

---

## 6. First-principles analysis

### 6.1 What this product actually is

Strip away the feature list and the product has one job: **move a specific, defensible
inference — "this trade is suspiciously timed relative to the President's own words and acts
about that company" — from impossible to sixty seconds.** The federal government publishes
the raw facts in a form engineered to resist exactly this inference (signed PDFs in a Lotus
Notes silo, no API, transcripts deleted). Everything valuable here is in service of making
that one inference *fast and defensible*; everything else is secondary.

That reframing yields a sharper priority order than the PRD's milestone list, because it
exposes which gaps are load-bearing and which are cosmetic.

### 6.2 The transparency paradox in the scoring model

The product's strongest asset — radical transparency — is currently turned against it. The
correlation card faithfully renders six component bars, but three are constants
(`entitySpecificity = 1`, `authority = 1`, `directionalConsistency = 0.5`,
`correlate.ts:148-155`). A careful reader — exactly the journalist/watchdog persona the PRD
targets — sees three flat bars and correctly infers that the "analysis" is partly theater.
**Showing an audit trail that implies more reasoning than occurred is a more corrosive
failure for a transparency product than showing a simpler-but-honest score.** Two paths,
either acceptable, neither is the status quo:

- **Make the axes real.** `entitySpecificity` is implementable today from data already
  present (direct issuer mention 1.0 / sub-industry 0.6 / sector-only 0.3 — requires §6.3's
  sector candidates). `directionalConsistency` becomes real once price-reaction sign meets
  trade side (prices are already fetched): a Purchase before a sector-favorable action scores
  1.0, a contrary pairing 0.0, unknown 0.5. `authority` should become a per-filer field on
  `persons` so the Cabinet/Congress extension (G8) actually exercises it.
- **Or shrink the public score** to the axes that genuinely vary (temporal proximity,
  magnitude, corroboration) and label the rest "not yet modelled (v1)" instead of painting
  them as full-marks bars.

### 6.3 The under-exploited dimensions the schema already supports

1. **Sectors.** The schema has `statement_mentions.sector` and `action_targets.sector`, both
   **never populated**, and `correlate.ts` matches only on `company_id`. The signal "he
   praised *semiconductors* eight days before buying NVDA" — a textbook conflict pattern — is
   structurally invisible. Implementing sector candidate generation (PRD FR-C1) is the single
   biggest deepening of the core inference and it unlocks a real `entitySpecificity` axis.
2. **"What was knowable when."** The schema thoughtfully separates `transaction_date`,
   `disclosure_date`, and ingestion time (FR-C5), but the UI never uses the distinction. A
   "what could the public have known on date X" framing — scoring on transaction date,
   *labeling* with the 30–45-day disclosure lag — would sharpen every correlation without new
   data.
3. **Statements are the differentiator and they are one-third built.** The PRD's own
   60-second test ("what did he say about Palantir before he bought it?") today runs on Truth
   Social only — the *least* citable source. For the journalist persona, an answer sourced to
   a Truth Social post is a lead; an answer sourced to the Compilation of Presidential
   Documents is a citation. **Building CPD ingestion is the largest credibility unlock on the
   statement side**, and it is "spec'd" but unbuilt.

### 6.4 The moat

Quiver, Capitol Trades, and Unusual Whales stop at the trade. This product's entire reason to
exist is the *evidentiary trail* from trade to the President's words and acts. Therefore the
trail's first link — extraction — must be provably correct, not asserted correct. Today it is
a single OCR pass with no second-source reconciliation (FR-T8 unbuilt, `reconciled_sources`
never written) and no signature verification (FR-T3 unbuilt, `signature_verified` never
written). **Implementing ProPublica reconciliation and surfacing it in the UI converts the
product from "a site that says it is rigorous" to "a site that shows its rigor" — the single
highest-leverage investment available, and the actual moat.**

---

## 7. Improvement plan by workstream

Workstream items referenced elsewhere in this document, with fixes:

| ID | Workstream item | Action |
|---|---|---|
| W-6 | Timeline statement-lane selection is non-deterministic at scale: `getTimelineEvents` caps each lane at `limit` with `selectDistinctOn` ordered only by id/date, so which statements appear is arbitrary once volume exceeds the cap. | Select the statements/actions that actually participate in correlations first, then backfill; make ordering deterministic (by signal then date). Add zoom/pan/filter controls (FR-W6). |
| W-7 | Graph ships the entire `{nodes, links}` set and `getGraph` loads full `statements`/`actions`/`companies` tables per request; no lazy expansion (FR-W7). | Bounded recursive-CTE neighborhood endpoint (depth ≤ 3, visited-set, LIMIT) + client-side lazy expansion on node click. Cache the person-rooted default view. |
| W-9 | Provenance PDFs live only in the evictable GitHub Actions cache (`data/pdfs/`), so a "every datum traceable to a source PDF page" guarantee depends on a cache that GitHub evicts after 7 days of inactivity. | Persist raw PDFs to durable object storage (or repo LFS, as Architecture §2 allows) on fetch; store the durable URL in `filings.raw_pdf_path`. |
| W-10 | One stage failure aborts the whole run: `run.ts` `case "all"` awaits stages sequentially with no try/per-stage isolation, so a `fetch` network blip skips `correlate`/`graph`. Contradicts the "a failed stage retries without re-running successful stages" reliability NFR. | Wrap each stage in independent error capture (the `withRun` log already isolates logging; isolate control flow too) and continue; surface partial failure in `ingestion_runs`. |
| W-13 | White House fact sheets/articles are ingested into the `actions` table with `white_house_*` action types (`ingest-whitehouse.ts`), conflating *statements* (things he said) with *official actions* (things government did) — they then score and render as "Official action." | Either route White House remarks to `statements` with `attribution_method='official_transcript'`, or keep them in `actions` but label them honestly as "administration communication," not "official action." |
| W-15 | Methodology page omits the scoring **weights** it promises to publish, **misstates** the price source as "Stooq" (code uses Alpha Vantage + Finnhub), and has no changelog despite the versioning commitment. | Render weights from the `WEIGHTS` constant directly; fix the source copy; add a methodology changelog section keyed to `scoring_version`. |
| W-16 | Every page is `export const dynamic = "force-dynamic"`, so the serving tier hits Neon on every request; Architecture §7.2 specifies ISR with tag revalidation, and `pipeline.yml` already calls a `$REVALIDATE_URL` that has **no corresponding route** (`app/api/revalidate` does not exist). | Convert read pages to ISR with `revalidateTag`; add the `app/api/revalidate/route.ts` the pipeline already expects; protect it with a shared secret. |
| W-17 | Dashboard missing FR-W1 modules: top holdings, sector breakdown chart, gain/loss leaders. | Add the three modules; the data (band sums per company, sector aggregates, `gain_loss_pct`) already exists. |
| W-18 | No accessibility tabular equivalents for timeline/graph (FR NFR + FR-W6/W7); muted text fails WCAG AA (measured 3.62:1 on paper, 3.98:1 on cards). | Add visually-hidden (or toggleable) `<table>` equivalents; darken `--color-muted` to ≈`#6b6253` (≈4.6:1) or restrict the current tone to ≥18px/bold. |

---

## 8. Code cleanup inventory

| Item | Disposition |
|---|---|
| **`zod`** declared in `package.json`, imported nowhere. | Wire into API validation (D5) — do not remove; it is the right tool and the API needs it. |
| **`src/components/Placeholder.tsx`** — imported nowhere. | Delete, or repurpose for the unbuilt API-docs sections. |
| **`db:migrate` script → missing `src/db/migrate.ts`.** | Add the runner (S-5) or remove the script. |
| **Unpopulated schema columns:** `transactions.security_type`, `owner`, `companies.figi`, `parent_id`, `filings.signature_verified`, `reconciled_sources`, `version`/`supersedes_id` (corrections-as-versions), `statement_mentions.sector`, `action_targets.sector`. | Several (`signature_verified`, `reconciled_sources`) front acceptance gates the product *claims* to meet; populate those (FR-T3/T8) rather than leave them silently null. Annotate the genuinely-deferred ones (`figi`, `parent_id`, embeddings) as forward-looking in a schema comment. |
| **`api-docs/page.tsx`** advertises 2 of 3 live endpoints (omits `/graph`) and hardcodes "lands in Phase 4." | Generate from the OpenAPI spec (FR-API4) instead of hand-maintaining. |
| **`statements.embedding` / `pgvector`** in Architecture §5 but absent from `schema.ts`. | Reasonable v1 cut; document the deferral or restore for semantic dedup/search. |
| **Committed OCR cache** (`data/cache/ocr/`, ~200 files; intentional per `.gitignore`). | Acceptable now; will grow unbounded across filings — move to artifact storage / LFS before it bloats the repo. |
| **`next.config.ts`** `typedRoutes` disabled "until every route exists." | All routes now exist; re-enable for compile-time link safety. |
| **Missing `LICENSE`** (Plan task 0.1 requires MIT/CC). | Add — a public transparency project must state its license; absence blocks the reuse G6 wants. |
| **Missing `app/error.tsx`, `not-found.tsx`, `loading.tsx`, `sitemap.ts`, `robots.ts`, JSON-LD.** | Add branded error/not-found boundaries, route-level loading skeletons, and the SEO surface (Plan 4.10). |

---

## 9. Testing strategy

The suite is **one file** (`bands.test.ts`, 6 tests). The credibility-critical paths have
zero coverage. Minimum bar before calling the trade spine "ironclad":

1. **Status withholding** (D1 regression) — `getTransaction`/`getFiling`/`getCorrelations`
   return nothing for `review`/`pending`/`superseded`; API never emits them.
2. **Gazetteer precision** — the `WEAK_SOLO_TOKENS` / cashtag-only-ticker logic is the
   product's misattribution firewall and is untested. Assert "the southern border" does **not**
   match Southern Co, "$NVDA" and "Nvidia" both match NVDA, "research and engineering" does
   not match Lam Research, etc. (The live run confirmed these work — lock them in.)
3. **Quote-span verification** (FR-S5) — every stored `statement_mentions.exact_quote` is
   byte-present at its `[char_start, char_end]` in `full_text`.
4. **Band resolution from messy OCR** — `resolveBand` and the Python `resolve_band` against
   real degraded strings ("$1,000,001 — $5,000,000", "Over $50,000,000", OCR'd "S5,000,001").
5. **Correlate** — windowing (asymmetric −45/+30), threshold, per-trade cap, **no duplicate
   pairs** (D3 regression), **verdict preservation across re-run** (D2 regression).
6. **Idempotency** — run `correlate`/`graph-build` twice; assert identical row counts and no
   verdict loss (the cross-cutting idempotency assertion the plan calls for).
7. **API contract** — envelope shape, pagination math, 400 on malformed params (D5), no
   driver text in errors.

Wire `vitest` against an ephemeral Postgres in CI (the Architecture's GitHub Actions runner
already has one available) so these run on every push.

---

## 10. Sequenced roadmap

**P0 — trust defects (before any public launch):** D1 (withheld-row leak) · D2 (verdict
wipe) · D3 (duplicate correlations) · D4 (secret-in-CI-logs + key rotation) · D5 (error
leakage). Each is reproduced above with a concrete fix and a regression test.

**P1 — honor the credibility claims the PRD asserts:** make the scoring model honest (§6.2)
· sector candidate generation + populate `statement_mentions.sector` (§6.3) · ProPublica
reconciliation and surface `reconciled_sources` (FR-T8, the moat) · CPD statement source
(G2) · USAspending actions (FR-A2) · API-key auth + rate limiting + read-only DB role
(S-1/S-2) · reconcile the "consensus extraction" docs with the real single-OCR-plus-adjudicator
design, or build the second extractor (do not keep claiming "consensus" until it is true).

**P2 — hardening & polish:** committed migrations (S-5) · ISR + the missing revalidate route
(W-16) · error/not-found/loading boundaries · contrast fix + tabular equivalents (W-18) · the
test suite (§9) · LICENSE · sitemap/robots/JSON-LD · methodology weights/price-source/changelog
(W-15) · durable PDF storage (W-9) · per-stage isolation in the pipeline (W-10).

**P3 — deepening (first-principles §6):** operator review queue (FR-O3) · "publicly knowable"
disclosure-date framing in the UI (FR-C5) · sector lens across the UI · bulk export + OpenAPI
(FR-API4/5) · signature verification (FR-T3) · graph lazy expansion (W-7) · dashboard holdings/
sector/gain-loss modules (W-17) · per-filer `authority` for the Cabinet/Congress extension (G8).

---

## 11. What is genuinely good (keep it)

- The free-tier split topology (heavy work in CI, read-only serving) is the right
  architecture and is correctly implemented.
- Editorial discipline is real and structural: neutral language throughout, the standing
  disclaimer on every correlation surface and in the footer, amounts always as ranges enforced
  by `formatAmount`/`compactRange`, no accusatory copy found in the audit.
- The gazetteer precision hardening reflects exactly the right precision-over-recall instinct
  and was verified working against the seeded false-positive trap — it needs only durable
  verdicts (D2) and tests to lock it in.
- The UI is polished, on-brand, fully responsive (verified on iPhone 13 viewport), and ships
  with zero console errors and sensible empty states across all nine routes.
- The data model — typed entity tables plus one polymorphic edge projection, three separate
  date semantics, immutable-with-versions intent — is well-considered and genuinely extensible.

The bones are excellent. The work ahead is converting *asserted* rigor into *demonstrated*
rigor, fixing the four trust defects that live testing surfaced, and finishing the load-bearing
features (reconciliation, real scoring, authoritative statements, the open API) that the PRD
treats as the entire point.

---

## Appendix — Remediation record (June 2026)

Every item above was addressed in the commit series following this document. Status key:
✅ implemented & verified · 🟨 implemented as the honest first step (full version documented).

| Item | Status | Where |
|---|---|---|
| D1 withheld-row leak | ✅ status gate + UUID guard in every detail query; HTTP-verified 404; regression tests | `fix: P0 trust defects` |
| D2 verdict wipe | ✅ upsert on `uq_corr_pair` (NULLS NOT DISTINCT) + `refreshed_at` prune; verdict-preservation test | same |
| D3 duplicate correlations | ✅ DISTINCT candidates per event; idempotency test | same |
| D4 secrets in CI logs | ✅ `redactUrl()` on every pipeline error path + tests (operator should still rotate previously-exposed keys) | same |
| D5 error leakage / 500s | ✅ zod-validated params (the formerly unused dependency), generic 500s, 404 on bad ids | same |
| Timezone date bug | ✅ UTC-pinned `formatDate`; CI runs the suite under `TZ=America/Denver` | same |
| §6.2 scoring honesty | ✅ v1.1: placeholder component removed, entitySpecificity varies (1.0/0.6), per-filer `authority`; weights/definitions/changelog rendered from `src/lib/scoring.ts` | `feat: honest correlation scoring v1.1` |
| §6.3 sector dimension | ✅ sub-industry topic gazetteer → `statement_mentions.sector` / `action_targets.sector` → topic-tier candidates | same |
| W-15 methodology drift | ✅ weights table from source, price-source corrected, changelog added; ARCHITECTURE §4/§6 rewritten to the implemented design | same |
| FR-API1–5 open data | ✅ 12 endpoints incl. statements/actions/correlations/companies, streamed NDJSON+CSV export, OpenAPI 3.1 at `/api/v1/openapi.json`, `/api-docs` rendered from the spec | `feat: complete the open-data API` |
| S-1 auth + rate limiting | ✅ SHA-256 key auth (401 on bad key), per-subject daily counters (`api_usage`), X-RateLimit headers, verified 429 | same |
| S-2 read-only role | ✅ `dbRo` (`DATABASE_URL_RO`) for all public queries; rate counter is the single serving-tier write | same |
| FR-T8 reconciliation | 🟨 source-agnostic NDJSON engine + `reconciled_sources` surfaced on trade detail; operator supplies the ProPublica snapshot via `RECONCILE_DATA_*` | `feat: pipeline robustness` |
| G2 statement sources | 🟨 govinfo CPD ingester (authoritative source; multi-speaker categories deferred to a segmentation layer rather than risk misattribution); APP scraper remains future work | same |
| FR-A2 USAspending | ✅ contract awards → `contract` actions + `contract_recipient` targets with fuzzy-match rejection | same |
| W-10 stage isolation | ✅ per-stage failure domains in `run.ts all`; non-zero exit preserved for alerting | same |
| W-13 statements-as-actions | ✅ WH remarks → `statements`; remaining WH items labelled "Administration communication" in the UI | same + frontend commit |
| FR-T3 signatures | 🟨 PKCS#7 *presence* detected and recorded (`signature_present`); cryptographic chain verification still deferred and never implied | same |
| W-9 provenance durability | 🟨 raw PDFs uploaded as 90-day CI artifacts every run; durable object storage remains the recommended end state | same |
| FR-O4 alerting | ✅ pipeline failure opens a labelled repo issue | same |
| FR-W1 dashboard modules | ✅ top holdings (as ranges), sector concentration, gain/loss leaders | `feat: frontend completion` |
| W-6 timeline determinism | ✅ most-recent-mentioned selection + lane filters + correlated-only toggle | same |
| W-18 accessibility | ✅ AA-passing muted (#6e6557, 5.0:1), table equivalents for timeline & graph, skip link, region labels | same |
| W-16 ISR + revalidate | ✅ ISR on read pages; `/api/revalidate` (the endpoint `pipeline.yml` already called) | same |
| W-7 graph payload | 🟨 label loads bounded to graph-referenced ids; full lazy-expansion neighborhood API remains future work | same |
| FR-O3 review queue | ✅ `/admin/review` (Basic Auth, off unless `ADMIN_PASSWORD` set) with publish/withhold actions | same |
| FR-C5 disclosure framing | ✅ disclosure-lag fact on trade detail | pipeline commit |
| SEO / errors / headers | ✅ sitemap, robots, JSON-LD Dataset, branded 404/error/loading, CSP + HSTS + frame-deny | frontend commit |
| S-5 migrations | ✅ committed baseline + `db:migrate` runner (verified against a fresh DB) | cleanup commit |
| §9 testing | ✅ 49 tests: gazetteer precision firewall, scoring invariants, topics, reconcile matcher, redaction, dates, D1/D2/D3 DB regressions; CI workflow runs all of it + build against Postgres 16 with TZ pinned west of UTC | throughout + cleanup |
| Cleanup inventory | ✅ `zod` wired, `Placeholder.tsx` removed, `db:migrate` real, typedRoutes enabled, deferred columns annotated, LICENSE (MIT) added, README rewritten | cleanup commit |

**Still open (documented, deliberately not faked):** full PKCS#7 chain verification (FR-T3);
American Presidency Project scraper and the caption/speaker-segmentation layer (FR-S1
priorities 1/5, FR-S3); CPD-upgrades-faster-source reconciliation (FR-S6); LLM mention layer
with sentiment/stance (FR-S4 beyond gazetteer); directional-consistency modelling (returns to
the score when price-impact direction exists); graph lazy-expansion API; durable object
storage for PDFs; OGE `PAS+Index` polling for the future Cabinet expansion.