/**
 * Stage 3 — Parse.
 *
 * Runs the Python content-anchored extractor against each pending 278-T
 * filing, applies the validation gate (ARCHITECTURE §4.2), scores parse
 * confidence, and writes transaction rows. Filings below the confidence
 * threshold are stored but held at status `review` and withheld from the
 * public view.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { db } from "@/db";
import { filings, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getBand } from "@/lib/bands";
import { adjudicate } from "../lib/adjudicator";

const execFileAsync = promisify(execFile);

const PY = join(process.cwd(), "pipeline", ".venv", "bin", "python3");
const SCRIPT = join(process.cwd(), "pipeline", "extract_278t.py");

const VALID_TYPES = new Set(["Purchase", "Sale", "Sale (Partial)", "Exchange"]);
/** Filings scoring below this are held for human review. */
const CONFIDENCE_THRESHOLD = 0.7;

export interface ExtractedRow {
  sourcePage: number;
  rowNumber: number;
  descriptionRaw: string;
  transactionType: string;
  transactionDate: string;
  notificationLate: boolean;
  amountBand: number;
  amountRaw: string;
}

export interface ExtractorOutput {
  pdfPath: string;
  pageCount: number;
  declaredPageTotal: number | null;
  pages: { page: number; textSource: string; rowsFound: number; chars: number }[];
  transactionCount: number;
  rows: ExtractedRow[];
}

export interface ParseResult {
  parsed: number;
  needsReview: number;
  failed: number;
  errors: string[];
}

async function runExtractor(pdfPath: string, filingDate: string): Promise<ExtractorOutput> {
  const { stdout } = await execFileAsync(PY, [SCRIPT, pdfPath, filingDate], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 25 * 60 * 1000, // OCR of a 100+ page scan is slow
  });
  return JSON.parse(stdout) as ExtractorOutput;
}

/**
 * Row *validity* — whether a row is a publishable transaction. A row is valid
 * if it has a real date, a real amount band, and a description. The transaction
 * TYPE is deliberately excluded: OCR frequently mangles the word "purchase",
 * but a row with a sound date + amount + security is still a real, publishable
 * disclosure. Type quality is scored separately, not used to reject rows.
 */
function rowValidityIssues(row: ExtractedRow): string[] {
  const issues: string[] = [];
  if (Number.isNaN(Date.parse(row.transactionDate))) issues.push("date");
  if (row.amountBand < 1 || row.amountBand > 10) issues.push("band");
  if (!row.descriptionRaw || row.descriptionRaw.length < 3) issues.push("description");
  return issues;
}

function typeKnown(row: ExtractedRow): boolean {
  return VALID_TYPES.has(row.transactionType);
}

/**
 * Validation gate + confidence score for a whole filing.
 *
 * confidence = validShare · (0.75 + 0.25·typeKnownShare) · (1 − 0.10·ocrShare)
 * and is further discounted if page-count reconciliation fails. This rewards
 * complete, well-typed, page-reconciled filings while still publishing OCR
 * filings whose dates/amounts are sound but whose type labels are noisy.
 */
function scoreFiling(out: ExtractorOutput): {
  confidence: number;
  pageReconciled: boolean;
  ocrShare: number;
} {
  const rows = out.rows;
  if (rows.length === 0) return { confidence: 0, pageReconciled: false, ocrShare: 1 };

  const validShare = rows.filter((r) => rowValidityIssues(r).length === 0).length / rows.length;
  const typeShare = rows.filter(typeKnown).length / rows.length;

  const ocrPages = out.pages.filter((p) => p.textSource === "ocr" && p.rowsFound > 0).length;
  const dataPages = out.pages.filter((p) => p.rowsFound > 0).length || 1;
  const ocrShare = ocrPages / dataPages;

  const pageReconciled =
    out.declaredPageTotal === null || out.declaredPageTotal === out.pageCount;

  let confidence = validShare * (0.75 + 0.25 * typeShare) * (1 - 0.1 * ocrShare);
  if (!pageReconciled) confidence *= 0.85;
  return { confidence: Math.round(confidence * 1000) / 1000, pageReconciled, ocrShare };
}

/** Parse all pending 278-T filings. */
export async function parseFilings(): Promise<ParseResult> {
  const pending = await db
    .select()
    .from(filings)
    .where(eq(filings.status, "pending"));

  const result: ParseResult = { parsed: 0, needsReview: 0, failed: 0, errors: [] };

  for (const filing of pending) {
    if (filing.formType !== "278-T") {
      // 278e (annual asset disclosure) has a different structure; the trade
      // spine (v1) covers 278-T periodic transaction reports only.
      await db
        .update(filings)
        .set({ status: "parsed", transactionCount: 0, parsedAt: new Date(),
               parseMethod: "skipped-278e" })
        .where(eq(filings.id, filing.id));
      continue;
    }
    if (!filing.rawPdfPath) {
      result.errors.push(`${filing.id}: no rawPdfPath`);
      result.failed++;
      continue;
    }
    try {
      console.log(`[parse] extracting ${filing.sourceUrl.split("/").pop()}`);
      let out = await runExtractor(filing.rawPdfPath, filing.filingDate);
      let { confidence, ocrShare } = scoreFiling(out);

      // Adjudication: a no-op unless ANTHROPIC_API_KEY is configured.
      const adjudicated = await adjudicate(filing, out, confidence);
      if (adjudicated) {
        out = adjudicated.output;
        confidence = adjudicated.confidence;
      }

      const dates = out.rows
        .map((r) => r.transactionDate)
        .filter((d) => !Number.isNaN(Date.parse(d)))
        .sort();
      const status = confidence >= CONFIDENCE_THRESHOLD ? "parsed" : "review";

      await db.transaction(async (tx) => {
        await tx.delete(transactions).where(eq(transactions.filingId, filing.id));
        if (out.rows.length > 0) {
          await tx.insert(transactions).values(
            out.rows.map((r) => {
              const band = getBand(r.amountBand);
              const valid = rowValidityIssues(r).length === 0;
              const rowConf = !valid ? 0.3 : typeKnown(r) ? 1 : 0.7;
              return {
                filingId: filing.id,
                personId: filing.personId,
                rowNumber: r.rowNumber,
                sourcePage: r.sourcePage,
                descriptionRaw: r.descriptionRaw,
                transactionType: r.transactionType,
                transactionDate: r.transactionDate,
                disclosureDate: filing.filingDate,
                notificationLate: r.notificationLate,
                amountBand: r.amountBand,
                amountMin: band.min,
                amountMax: band.max,
                rowConfidence: rowConf,
              };
            }),
          );
        }
        await tx
          .update(filings)
          .set({
            status,
            transactionCount: out.rows.length,
            pageCount: out.pageCount,
            parseMethod: ocrShare > 0 ? "heuristic-ocr" : "heuristic-embedded",
            parseConfidence: confidence,
            reportPeriodStart: dates[0] ?? null,
            reportPeriodEnd: dates[dates.length - 1] ?? null,
            parsedAt: new Date(),
          })
          .where(eq(filings.id, filing.id));
      });

      if (status === "parsed") result.parsed++;
      else result.needsReview++;
      console.log(
        `[parse]   ${out.rows.length} rows, confidence ${confidence} -> ${status}`,
      );
    } catch (err) {
      result.failed++;
      result.errors.push(`${filing.sourceUrl}: ${String(err)}`);
      console.error(`[parse] ERROR ${filing.sourceUrl}: ${String(err)}`);
    }
  }
  return result;
}
