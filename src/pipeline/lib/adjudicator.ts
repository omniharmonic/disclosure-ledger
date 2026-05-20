/**
 * LLM adjudicator (ARCHITECTURE §4.1, stage 3 tertiary).
 *
 * The heuristic extractor is reliable on embedded-text filings but degrades on
 * pure scans. When a filing scores below the adjudication threshold AND an
 * Anthropic API key is configured, the raw PDF is sent to Claude — which reads
 * PDFs natively — and re-extracted under a strict JSON schema. The result is
 * merged only if it improves confidence.
 *
 * Without `ANTHROPIC_API_KEY` this is a logged no-op: the heuristic result
 * stands and low-confidence filings fall to the `review` queue. The module is
 * therefore safe to ship before a key is provisioned.
 */
import { readFile } from "node:fs/promises";
import type { Filing } from "@/db/schema";
import { resolveBand } from "@/lib/bands";
import type { ExtractorOutput, ExtractedRow } from "../stages/parse";

/** Adjudicate filings scoring below this; above it the heuristic is trusted. */
const ADJUDICATION_THRESHOLD = 0.9;
/** Base64 of a PDF larger than this is impractical for a single request. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MODEL = "claude-sonnet-4-6";

export interface AdjudicationResult {
  output: ExtractorOutput;
  confidence: number;
}

const TRANSACTION_TOOL = {
  name: "record_transactions",
  description:
    "Record every transaction row from the OGE Form 278-T transaction table.",
  input_schema: {
    type: "object" as const,
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            row_number: { type: "integer" },
            source_page: { type: "integer" },
            description: { type: "string", description: "verbatim security name" },
            type: { type: "string", enum: ["Purchase", "Sale", "Sale (Partial)", "Exchange"] },
            date: { type: "string", description: "transaction date, YYYY-MM-DD" },
            notification_late: { type: "boolean" },
            amount: { type: "string", description: "verbatim amount range string" },
          },
          required: ["row_number", "description", "type", "date", "amount"],
        },
      },
    },
    required: ["rows"],
  },
};

const PROMPT = `This PDF is a U.S. OGE Form 278-T Periodic Transaction Report. \
Extract EVERY row of the transaction table(s). For each row record the \
sequential number, the page it appears on, the verbatim security description, \
the transaction type, the transaction date (not any bond maturity date), \
whether the late-notification box is checked, and the verbatim amount range. \
Do not invent rows; transcribe exactly what is printed. Call record_transactions \
once with all rows.`;

/**
 * Attempt LLM adjudication. Returns an improved result, or null when
 * adjudication is skipped (no key, filing too large) or fails to improve.
 */
export async function adjudicate(
  filing: Filing,
  heuristic: ExtractorOutput,
  heuristicConfidence: number,
): Promise<AdjudicationResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (heuristicConfidence < ADJUDICATION_THRESHOLD) {
      console.log(
        `[adjudicate] skipped (no ANTHROPIC_API_KEY) — ${filing.sourceUrl
          .split("/")
          .pop()} stays at heuristic confidence ${heuristicConfidence}`,
      );
    }
    return null;
  }
  if (heuristicConfidence >= ADJUDICATION_THRESHOLD) return null;
  if (!filing.rawPdfPath) return null;

  const bytes = await readFile(filing.rawPdfPath);
  if (bytes.length > MAX_PDF_BYTES) {
    console.log(
      `[adjudicate] skipped — ${filing.sourceUrl.split("/").pop()} is ${(
        bytes.length /
        1024 /
        1024
      ).toFixed(1)} MB (over ${MAX_PDF_BYTES / 1024 / 1024} MB single-request limit)`,
    );
    return null;
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16_000,
      tools: [TRANSACTION_TOOL],
      tool_choice: { type: "tool", name: "record_transactions" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: bytes.toString("base64"),
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;
    const rows = (toolUse.input as { rows: LlmRow[] }).rows;

    // Truncation guard: a response that hit the token ceiling returns far
    // fewer rows than the page actually holds. Never replace a fuller
    // heuristic extraction with a truncated LLM one.
    if (
      response.stop_reason === "max_tokens" ||
      rows.length < heuristic.rows.length * 0.85
    ) {
      console.log(
        `[adjudicate] discarded — LLM returned ${rows.length} rows vs heuristic ` +
          `${heuristic.rows.length} (likely truncated); keeping heuristic`,
      );
      return null;
    }
    const output = toLlmOutput(heuristic, rows);

    // Trust the LLM extraction: it read the form directly under a strict
    // schema. Confidence is high but not 1.0 — still subject to validation.
    const confidence = 0.92;
    if (confidence <= heuristicConfidence) return null;
    console.log(
      `[adjudicate] LLM re-extracted ${rows.length} rows ` +
        `(heuristic had ${heuristic.rows.length})`,
    );
    return { output, confidence };
  } catch (err) {
    console.error(`[adjudicate] failed, keeping heuristic result: ${String(err)}`);
    return null;
  }
}

interface LlmRow {
  row_number: number;
  source_page?: number;
  description: string;
  type: string;
  date: string;
  notification_late?: boolean;
  amount: string;
}

function toLlmOutput(base: ExtractorOutput, llmRows: LlmRow[]): ExtractorOutput {
  const rows: ExtractedRow[] = llmRows.map((r, i) => ({
    sourcePage: r.source_page ?? 0,
    rowNumber: r.row_number ?? i + 1,
    descriptionRaw: r.description,
    transactionType: r.type,
    transactionDate: r.date,
    notificationLate: Boolean(r.notification_late),
    amountBand: resolveBand(r.amount) ?? 1,
    amountRaw: r.amount,
  }));
  return { ...base, transactionCount: rows.length, rows };
}
