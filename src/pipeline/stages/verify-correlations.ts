/**
 * Stage 7b — Verify correlations (reasoning layer).
 *
 * Gazetteer mention-matching is fast but literal: it cannot tell that "Southern
 * Co" and "the southern border" share a word by coincidence. This stage adds a
 * reasoning check — for each unverified correlation it asks an LLM whether the
 * statement (or action) is *genuinely about the company*, not merely a string
 * coincidence — and records a verdict plus a one-line reason.
 *
 * This is a PRODUCTION-pipeline stage: it calls the Anthropic API and is a
 * logged no-op when `ANTHROPIC_API_KEY` is absent (e.g. local development).
 * Run it in the deployed GitHub Actions pipeline, where the key is a secret.
 *
 * `correlations.verified_genuine`: null = unverified, true = genuine,
 * false = string coincidence. The public queries hide `false`.
 */
import { db } from "@/db";
import { correlations, transactions, companies, statements, actions } from "@/db/schema";
import { eq, isNull, sql } from "drizzle-orm";

const MODEL = "claude-sonnet-4-6";
const BATCH = 30;

interface Candidate {
  id: string;
  company: string;
  ticker: string | null;
  eventKind: string;
  eventText: string;
}

const TOOL = {
  name: "record_verdicts",
  description: "Record, for each correlation, whether the text is genuinely about the company.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            genuine: {
              type: "boolean",
              description:
                "true if the text genuinely concerns this company; false if it only shares a word/string by coincidence",
            },
            reason: { type: "string", description: "one short sentence" },
          },
          required: ["id", "genuine", "reason"],
        },
      },
    },
    required: ["verdicts"],
  },
};

export interface VerifyResult {
  verified: number;
  genuine: number;
  falseMatches: number;
  skipped: boolean;
}

export async function verifyCorrelations(): Promise<VerifyResult> {
  const result: VerifyResult = { verified: 0, genuine: 0, falseMatches: 0, skipped: false };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[verify] skipped — no ANTHROPIC_API_KEY (production-only reasoning stage)");
    result.skipped = true;
    return result;
  }

  const rows = await db
    .select({
      id: correlations.id,
      company: companies.name,
      ticker: companies.ticker,
      eventKind: correlations.eventKind,
      statementText: statements.fullText,
      actionTitle: actions.title,
    })
    .from(correlations)
    .innerJoin(transactions, eq(correlations.transactionId, transactions.id))
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .leftJoin(statements, eq(correlations.statementId, statements.id))
    .leftJoin(actions, eq(correlations.actionId, actions.id))
    .where(isNull(correlations.verifiedGenuine));

  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    company: r.company,
    ticker: r.ticker,
    eventKind: r.eventKind,
    eventText: ((r.eventKind === "statement" ? r.statementText : r.actionTitle) ?? "").slice(0, 600),
  }));

  if (candidates.length === 0) return result;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const list = batch
      .map(
        (c) =>
          `id=${c.id}\ncompany=${c.company} (${c.ticker ?? "?"})\n${c.eventKind}="${c.eventText}"`,
      )
      .join("\n---\n");
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "record_verdicts" },
        messages: [
          {
            role: "user",
            content:
              `For each item below, decide whether the text is GENUINELY about the named ` +
              `company — its business, products, executives, sector, or a government action ` +
              `affecting it — or whether it merely shares a word or string by coincidence ` +
              `(e.g. "Southern Co" vs. "the southern border"). Call record_verdicts.\n\n${list}`,
          },
        ],
      });
      const tool = res.content.find((b) => b.type === "tool_use");
      if (!tool || tool.type !== "tool_use") continue;
      const verdicts = (tool.input as { verdicts: { id: string; genuine: boolean; reason: string }[] })
        .verdicts;
      for (const v of verdicts) {
        await db
          .update(correlations)
          .set({ verifiedGenuine: v.genuine, verdictReason: v.reason })
          .where(eq(correlations.id, v.id));
        result.verified++;
        if (v.genuine) result.genuine++;
        else result.falseMatches++;
      }
    } catch (err) {
      console.error(`[verify] batch ${i / BATCH} failed: ${String(err)}`);
    }
  }

  console.log(
    `[verify] ${result.verified} verified — ${result.genuine} genuine, ` +
      `${result.falseMatches} false matches removed from public view`,
  );
  return result;
}

export async function unverifiedCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(correlations)
    .where(isNull(correlations.verifiedGenuine));
  return Number(row?.n ?? 0);
}
