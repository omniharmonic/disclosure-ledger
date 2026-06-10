/**
 * Stage 7 — Correlate.
 *
 * For every trade in a resolved company, finds statements and official actions
 * about that company — named directly, or addressing its sub-industry topic —
 * within an asymmetric window around the transaction date, and scores each
 * (trade ↔ event) pair with the transparent model in `src/lib/scoring.ts`.
 * Scores and their full component breakdown are materialized in
 * `correlations`.
 *
 * Re-scoring is an UPSERT keyed on the (trade, event) pair — never a
 * truncate-and-rebuild — so `verified_genuine` / `verdict_reason` survive
 * every run (FR-O2). Pairs the run no longer produces (window/threshold
 * change, event removed) are pruned by their stale `refreshed_at` stamp.
 *
 * The score is an analytical index — never a verdict.
 */
import { db } from "@/db";
import {
  transactions,
  filings,
  companies,
  persons,
  statements,
  statementMentions,
  actions,
  actionTargets,
  correlations,
} from "@/db/schema";
import { and, or, eq, gte, lte, lt, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import {
  SCORING_VERSION,
  type ScoreComponents,
  temporalProximity,
  magnitudeScore,
  corroborationScore,
  directionalScore,
  score,
} from "@/lib/scoring";
import { topicsForCompany } from "../lib/topics";

export { SCORING_VERSION };

/** Asymmetric candidate window: a trade preceding an event is the stronger signal. */
const WINDOW_BEFORE_DAYS = 45;
const WINDOW_AFTER_DAYS = 30;
/** Pairs below this score do not become correlations / graph edges. */
const SCORE_THRESHOLD = 25;
/** Cap per trade — keep only the highest-signal events so one heavily-named
 *  company does not bury a trade under hundreds of low-signal correlations. */
const MAX_PER_TRADE = 25;

/**
 * FR-S3 — attribution trust gate. Only statements whose attribution is
 * solved may form correlation edges: official transcripts always; caption-
 * derived spans only above the speaker-attribution confidence threshold and
 * never while flagged for review. Superseded records (a faster source later
 * upgraded to the official CPD text, FR-S6) never correlate — their official
 * replacement does.
 */
const TRUSTED_STATEMENT = and(
  isNull(statements.supersededBy),
  or(
    eq(statements.attributionMethod, "official_transcript"),
    and(
      eq(statements.attributionMethod, "caption_derived"),
      gte(statements.attributionConf, 0.8),
      sql`${statements.needsReview} is not true`,
    ),
  ),
);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface CandidateEvent {
  kind: "statement" | "action";
  id: string;
  date: string;
  /** 1.0 direct issuer mention · 0.6 sub-industry topic match. */
  specificity: number;
  /** Actions only — drives the contract-award direction signal. */
  actionType?: string | null;
}

export interface CorrelateResult {
  pairs: number;
  trades: number;
}

/** Build correlations for all resolved trades in public filings. */
export async function correlate(): Promise<CorrelateResult> {
  const runStarted = new Date();

  const trades = await db
    .select({
      id: transactions.id,
      companyId: transactions.companyId,
      date: transactions.transactionDate,
      type: transactions.transactionType,
      band: transactions.amountBand,
      industry: companies.industry,
      sector: companies.sector,
      authority: persons.authority,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .leftJoin(persons, eq(transactions.personId, persons.id))
    .where(
      and(isNotNull(transactions.companyId), inArray(filings.status, ["parsed", "published"])),
    );

  const result: CorrelateResult = { pairs: 0, trades: 0 };

  for (const t of trades) {
    if (!t.companyId) continue;
    const from = addDays(t.date, -WINDOW_BEFORE_DAYS);
    const to = addDays(t.date, WINDOW_AFTER_DAYS);
    const topics = topicsForCompany(t.industry, t.sector);
    let matched = false;

    // Direct candidates — events naming the company. DISTINCT per event: a
    // statement that mentions the company several times ("Nvidia … $NVDA") is
    // ONE event, not several — multiple spans previously created duplicate
    // correlation rows for the same (trade, statement) pair.
    const directStmts = await db
      .selectDistinctOn([statements.id], { id: statements.id, date: statements.spokenAt })
      .from(statementMentions)
      .innerJoin(statements, eq(statementMentions.statementId, statements.id))
      .where(
        and(
          eq(statementMentions.companyId, t.companyId),
          gte(statements.spokenAt, from),
          lte(statements.spokenAt, to),
          TRUSTED_STATEMENT,
        ),
      )
      .orderBy(statements.id);

    const directActs = await db
      .selectDistinctOn([actions.id], {
        id: actions.id,
        date: actions.occurredOn,
        actionType: actions.actionType,
      })
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

    // Topic candidates — events addressing the company's sub-industry
    // ("semiconductors" for a chip maker). Specificity 0.6 (PRD §6.2 scale).
    const topicStmts = topics.length
      ? await db
          .selectDistinctOn([statements.id], { id: statements.id, date: statements.spokenAt })
          .from(statementMentions)
          .innerJoin(statements, eq(statementMentions.statementId, statements.id))
          .where(
            and(
              inArray(statementMentions.sector, topics),
              gte(statements.spokenAt, from),
              lte(statements.spokenAt, to),
              TRUSTED_STATEMENT,
            ),
          )
          .orderBy(statements.id)
      : [];

    const topicActs = topics.length
      ? await db
          .selectDistinctOn([actions.id], {
            id: actions.id,
            date: actions.occurredOn,
            actionType: actions.actionType,
          })
          .from(actionTargets)
          .innerJoin(actions, eq(actionTargets.actionId, actions.id))
          .where(
            and(
              inArray(actionTargets.sector, topics),
              gte(actions.occurredOn, from),
              lte(actions.occurredOn, to),
            ),
          )
          .orderBy(actions.id)
      : [];

    // Merge, direct-first: an event that both names the company and mentions
    // the topic scores as a direct mention.
    const byKey = new Map<string, CandidateEvent>();
    const add = (
      kind: "statement" | "action",
      id: string,
      date: string,
      spec: number,
      actionType?: string | null,
    ) => {
      const k = `${kind}:${id}`;
      const existing = byKey.get(k);
      if (!existing || spec > existing.specificity)
        byKey.set(k, { kind, id, date, specificity: spec, actionType });
    };
    for (const s of directStmts) add("statement", s.id, s.date, 1);
    for (const a of directActs) add("action", a.id, a.date, 1, a.actionType);
    for (const s of topicStmts) add("statement", s.id, s.date, 0.6);
    for (const a of topicActs) add("action", a.id, a.date, 0.6, a.actionType);
    const events = [...byKey.values()];

    // Verified sentiment toward this company (or its topics) per candidate
    // statement — the statement side of the direction signal. LLM-enriched
    // spans win over bare gazetteer rows (which carry no sentiment).
    const stmtIds = events.filter((e) => e.kind === "statement").map((e) => e.id);
    const sentimentByStmt = new Map<string, string>();
    if (stmtIds.length > 0) {
      const rows = await db
        .select({
          statementId: statementMentions.statementId,
          sentiment: statementMentions.sentiment,
          method: statementMentions.method,
        })
        .from(statementMentions)
        .where(
          and(
            inArray(statementMentions.statementId, stmtIds),
            sql`${statementMentions.sentiment} is not null`,
            or(
              eq(statementMentions.companyId, t.companyId),
              topics.length ? inArray(statementMentions.sector, topics) : sql`false`,
            ),
          ),
        );
      for (const r of rows) {
        if (!r.sentiment) continue;
        // llm-method rows take precedence; first writer wins otherwise
        if (r.method === "llm" || !sentimentByStmt.has(r.statementId)) {
          sentimentByStmt.set(r.statementId, r.sentiment);
        }
      }
    }

    const corroboration = corroborationScore(events.length);
    const authority = t.authority ?? 1;
    const tradeMagnitude = magnitudeScore(t.band);

    const scored = events
      .map((ev) => {
        const gap = daysBetween(t.date, ev.date);
        const components: ScoreComponents = {
          temporalProximity: temporalProximity(gap),
          entitySpecificity: ev.specificity,
          authority,
          directionalConsistency: directionalScore(
            t.type,
            ev.kind,
            ev.kind === "statement" ? (sentimentByStmt.get(ev.id) ?? null) : null,
            ev.actionType ?? null,
          ),
          tradeMagnitude,
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
