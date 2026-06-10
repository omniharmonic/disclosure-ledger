/**
 * Stage 7 — Correlate.
 *
 * For every trade in a resolved company, finds statements and official actions
 * about that company within an asymmetric window around the transaction date,
 * and scores each (trade ↔ event) pair with the transparent multi-component
 * model in ARCHITECTURE §6.2. Scores and their full component breakdown are
 * materialized in `correlations`.
 *
 * The score is an analytical index — never a verdict.
 */
import { db } from "@/db";
import {
  transactions,
  filings,
  statements,
  statementMentions,
  actions,
  actionTargets,
  correlations,
} from "@/db/schema";
import { and, eq, gte, lte, lt, inArray, isNotNull, sql } from "drizzle-orm";
import { bandMidpoint } from "@/lib/bands";

export const SCORING_VERSION = "1.0";

/** Asymmetric candidate window: a trade preceding an event is the stronger signal. */
const WINDOW_BEFORE_DAYS = 45;
const WINDOW_AFTER_DAYS = 30;
/** Pairs below this score do not become correlations / graph edges. */
const SCORE_THRESHOLD = 25;
/** Cap per trade — keep only the highest-signal events so one heavily-named
 *  company does not bury a trade under hundreds of low-signal correlations. */
const MAX_PER_TRADE = 25;

const WEIGHTS = {
  temporalProximity: 0.3,
  entitySpecificity: 0.25,
  authority: 0.1,
  directionalConsistency: 0.15,
  tradeMagnitude: 0.1,
  corroboration: 0.1,
} as const;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** log-normalised band midpoint in [0,1]. */
function magnitudeScore(band: number): number {
  const lo = Math.log(8_000);
  const hi = Math.log(50_000_000);
  const v = (Math.log(bandMidpoint(band)) - lo) / (hi - lo);
  return Math.min(1, Math.max(0, v));
}

interface Components {
  temporalProximity: number;
  entitySpecificity: number;
  authority: number;
  directionalConsistency: number;
  tradeMagnitude: number;
  corroboration: number;
}

function score(c: Components): number {
  const s =
    WEIGHTS.temporalProximity * c.temporalProximity +
    WEIGHTS.entitySpecificity * c.entitySpecificity +
    WEIGHTS.authority * c.authority +
    WEIGHTS.directionalConsistency * c.directionalConsistency +
    WEIGHTS.tradeMagnitude * c.tradeMagnitude +
    WEIGHTS.corroboration * c.corroboration;
  return Math.round(s * 1000) / 10; // 0..100, one decimal
}

export interface CorrelateResult {
  pairs: number;
  trades: number;
}

/**
 * Build correlations for all resolved trades in public filings.
 *
 * Re-scoring is an UPSERT keyed on the (trade, event) pair — never a
 * truncate-and-rebuild — so `verified_genuine` / `verdict_reason` survive
 * every run (FR-O2). Pairs the run no longer produces (window/threshold
 * change, event removed) are pruned by their stale `refreshed_at` stamp.
 */
export async function correlate(): Promise<CorrelateResult> {
  const runStarted = new Date();

  const trades = await db
    .select({
      id: transactions.id,
      companyId: transactions.companyId,
      date: transactions.transactionDate,
      band: transactions.amountBand,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(
      and(isNotNull(transactions.companyId), inArray(filings.status, ["parsed", "published"])),
    );

  const result: CorrelateResult = { pairs: 0, trades: 0 };

  for (const t of trades) {
    if (!t.companyId) continue;
    const from = addDays(t.date, -WINDOW_BEFORE_DAYS);
    const to = addDays(t.date, WINDOW_AFTER_DAYS);
    let matched = false;

    // Candidate statements mentioning the company in-window. DISTINCT on the
    // statement: a statement that mentions the company several times ("Nvidia
    // … $NVDA") is ONE event, not several — multiple spans previously created
    // duplicate correlation rows for the same (trade, statement) pair.
    const stmts = await db
      .selectDistinctOn([statements.id], { id: statements.id, date: statements.spokenAt })
      .from(statementMentions)
      .innerJoin(statements, eq(statementMentions.statementId, statements.id))
      .where(
        and(
          eq(statementMentions.companyId, t.companyId),
          gte(statements.spokenAt, from),
          lte(statements.spokenAt, to),
        ),
      )
      .orderBy(statements.id);

    // Candidate actions affecting the company in-window (DISTINCT for the
    // same reason).
    const acts = await db
      .selectDistinctOn([actions.id], { id: actions.id, date: actions.occurredOn })
      .from(actionTargets)
      .innerJoin(actions, eq(actionTargets.actionId, actions.id))
      .where(
        and(
          eq(actionTargets.companyId, t.companyId),
          gte(actions.occurredOn, from),
          lte(actions.occurredOn, to),
        ),
      )
      .orderBy(actions.id);

    const events: { kind: "statement" | "action"; id: string; date: string }[] = [
      ...stmts.map((s) => ({ kind: "statement" as const, id: s.id, date: s.date })),
      ...acts.map((a) => ({ kind: "action" as const, id: a.id, date: a.date })),
    ];
    const corroboration = Math.min(1, Math.max(0, (events.length - 1) * 0.25));

    const scored = events
      .map((ev) => {
        const gap = daysBetween(t.date, ev.date);
        const components: Components = {
          temporalProximity: Math.round(Math.exp(-Math.abs(gap) / 14) * 1000) / 1000,
          entitySpecificity: 1, // gazetteer matched the issuer directly
          authority: 1, // the President has policy authority over every sector
          directionalConsistency: 0.5, // expected price-impact direction not modelled in v1
          tradeMagnitude: Math.round(magnitudeScore(t.band) * 1000) / 1000,
          corroboration,
        };
        return { ev, gap, components, signal: score(components) };
      })
      .filter((s) => s.signal >= SCORE_THRESHOLD)
      .sort((a, b) => b.signal - a.signal)
      .slice(0, MAX_PER_TRADE);

    for (const s of scored) {
      await db
        .insert(correlations)
        .values({
          transactionId: t.id,
          eventKind: s.ev.kind,
          statementId: s.ev.kind === "statement" ? s.ev.id : null,
          actionId: s.ev.kind === "action" ? s.ev.id : null,
          daysGap: s.gap,
          signalScore: s.signal,
          components: s.components,
          scoringVersion: SCORING_VERSION,
          refreshedAt: runStarted,
        })
        .onConflictDoUpdate({
          target: [
            correlations.transactionId,
            correlations.eventKind,
            correlations.statementId,
            correlations.actionId,
          ],
          set: {
            daysGap: s.gap,
            signalScore: s.signal,
            components: s.components,
            scoringVersion: SCORING_VERSION,
            refreshedAt: runStarted,
            // verifiedGenuine / verdictReason deliberately untouched — the
            // verify stage's (and any human reviewer's) verdicts persist.
          },
        });
      result.pairs++;
      matched = true;
    }
    if (matched) result.trades++;
  }

  // Prune pairs this run no longer produced (event removed, window or
  // threshold change). Everything still valid carries the fresh stamp.
  const pruned = await db
    .delete(correlations)
    .where(lt(correlations.refreshedAt, runStarted))
    .returning({ id: correlations.id });

  console.log(
    `[correlate] ${result.pairs} correlations across ${result.trades} trades` +
      (pruned.length ? `, ${pruned.length} stale pruned` : ""),
  );
  return result;
}

export async function correlationCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(correlations);
  return Number(row?.n ?? 0);
}
