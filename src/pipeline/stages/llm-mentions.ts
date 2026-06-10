/**
 * Stage 6c — LLM mention layer (FR-S4).
 *
 * The gazetteer is the cheap, precise first pass; this stage adds what
 * pattern-matching cannot: sentiment and stance for each detected mention,
 * plus fuzzy references the gazetteer missed (products, executives,
 * unambiguous nicknames) — constrained to the known company universe so the
 * model can never invent an entity.
 *
 * Cost control (PRD §10): only statements that already have at least one
 * gazetteer hit are sent (the gazetteer gates the LLM), and each statement
 * is processed once (skip when an `llm`-method mention exists).
 *
 * FR-S5 — every LLM-returned quote span is programmatically verified
 * byte-present in the source text before anything is stored; hallucinated
 * spans are rejected and counted. PRODUCTION stage: logged no-op without
 * ANTHROPIC_API_KEY.
 */
import { db } from "@/db";
import { companies, filings, statements, statementMentions, transactions } from "@/db/schema";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

const MODEL = "claude-sonnet-4-6";
const MAX_STATEMENT_CHARS = 6_000;
const SENTIMENTS = new Set(["positive", "negative", "neutral"]);
const STANCES = new Set([
  "praise", "attack", "policy", "tariff", "contract", "regulation", "endorsement", "other",
]);

export interface LlmMentionRow {
  ticker: string;
  exact_quote: string;
  sentiment: string;
  stance: string;
  confidence: number;
}

/**
 * FR-S5 — locate a verbatim quote in the source text. Returns offsets or
 * null when the span is not byte-present (hallucinated / paraphrased).
 * Pure + unit-tested.
 */
export function verifySpan(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const q = quote.trim();
  if (q.length < 3) return null;
  const start = text.indexOf(q);
  if (start === -1) return null;
  return { start, end: start + q.length };
}

const MENTION_TOOL = {
  name: "record_mentions",
  description:
    "Record every company from the provided universe that this statement genuinely references, with sentiment and stance.",
  input_schema: {
    type: "object" as const,
    properties: {
      mentions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string", description: "ticker from the provided universe ONLY" },
            exact_quote: {
              type: "string",
              description:
                "VERBATIM substring of the statement (copy characters exactly) showing the reference",
            },
            sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
            stance: {
              type: "string",
              enum: ["praise", "attack", "policy", "tariff", "contract", "regulation", "endorsement", "other"],
            },
            confidence: { type: "number", description: "0..1" },
          },
          required: ["ticker", "exact_quote", "sentiment", "stance", "confidence"],
        },
      },
    },
    required: ["mentions"],
  },
};

export interface LlmMentionsResult {
  statementsProcessed: number;
  enriched: number;
  added: number;
  rejectedSpans: number;
  skipped: boolean;
  errors: string[];
}

export async function llmMentions(): Promise<LlmMentionsResult> {
  const result: LlmMentionsResult = {
    statementsProcessed: 0,
    enriched: 0,
    added: 0,
    rejectedSpans: 0,
    skipped: false,
    errors: [],
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[llm-mentions] skipped — no ANTHROPIC_API_KEY (production-only reasoning stage)");
    result.skipped = true;
    return result;
  }

  // The traded universe — the only entities the model may report.
  const universe = await db
    .selectDistinct({ id: companies.id, ticker: companies.ticker, name: companies.name })
    .from(companies)
    .innerJoin(transactions, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(and(isNotNull(companies.ticker), inArray(filings.status, ["parsed", "published"])));
  if (universe.length === 0) return result;
  const byTicker = new Map(universe.map((c) => [c.ticker!.toUpperCase(), c]));
  const universeList = universe.map((c) => `${c.ticker}: ${c.name}`).join("\n");

  // Statements with a gazetteer hit but no LLM pass yet.
  const alreadyDone = db
    .select({ id: statementMentions.statementId })
    .from(statementMentions)
    .where(eq(statementMentions.method, "llm"));
  const candidates = await db
    .selectDistinct({ id: statements.id, text: statements.fullText })
    .from(statements)
    .innerJoin(statementMentions, eq(statementMentions.statementId, statements.id))
    .where(notInArray(statements.id, alreadyDone));

  if (candidates.length === 0) return result;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  for (const stmt of candidates) {
    const text = stmt.text.slice(0, MAX_STATEMENT_CHARS);
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        tools: [MENTION_TOOL],
        tool_choice: { type: "tool", name: "record_mentions" },
        messages: [
          {
            role: "user",
            content:
              `Company universe (the ONLY companies you may report):\n${universeList}\n\n` +
              `Statement:\n"""${text}"""\n\n` +
              `For each universe company this statement GENUINELY references — by name, ` +
              `product, executive, or unambiguous nickname — record it with a VERBATIM ` +
              `quote copied exactly from the statement, the speaker's sentiment toward ` +
              `the company, and the stance. Do not report companies that merely share a ` +
              `word with the text. Report nothing rather than guess. Call record_mentions.`,
          },
        ],
      });
      result.statementsProcessed++;

      const tool = res.content.find((b) => b.type === "tool_use");
      if (!tool || tool.type !== "tool_use") continue;
      const rows = ((tool.input as { mentions?: LlmMentionRow[] }).mentions ?? []).slice(0, 20);

      for (const row of rows) {
        const company = byTicker.get((row.ticker ?? "").toUpperCase());
        if (!company) continue; // outside the allowed universe
        const span = verifySpan(stmt.text, row.exact_quote ?? "");
        if (!span) {
          result.rejectedSpans++; // FR-S5: hallucinated/paraphrased span
          continue;
        }
        const sentiment = SENTIMENTS.has(row.sentiment) ? row.sentiment : null;
        const stance = STANCES.has(row.stance) ? row.stance : null;
        const confidence = Math.min(1, Math.max(0, Number(row.confidence) || 0));

        // Enrich existing gazetteer spans for this (statement, company)…
        const updated = await db
          .update(statementMentions)
          .set({ sentiment, stance })
          .where(
            and(
              eq(statementMentions.statementId, stmt.id),
              eq(statementMentions.companyId, company.id),
            ),
          )
          .returning({ id: statementMentions.id });
        if (updated.length > 0) {
          result.enriched += updated.length;
          continue;
        }
        // …or add a fuzzy reference the gazetteer missed.
        await db.insert(statementMentions).values({
          statementId: stmt.id,
          companyId: company.id,
          exactQuote: stmt.text.slice(span.start, span.end),
          charStart: span.start,
          charEnd: span.end,
          sentiment,
          stance,
          confidence,
          method: "llm",
        });
        result.added++;
      }
    } catch (err) {
      result.errors.push(`${stmt.id}: ${String(err)}`);
    }
  }

  console.log(
    `[llm-mentions] ${result.statementsProcessed} statements: ${result.enriched} spans ` +
      `enriched, ${result.added} fuzzy mentions added, ${result.rejectedSpans} spans rejected (FR-S5)`,
  );
  return result;
}

export async function llmMentionCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(statementMentions)
    .where(eq(statementMentions.method, "llm"));
  return Number(row?.n ?? 0);
}
