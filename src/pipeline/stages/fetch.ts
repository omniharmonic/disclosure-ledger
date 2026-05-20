/**
 * Stage 2 — Fetch.
 *
 * Downloads each discovered candidate PDF, computes a SHA-256 content hash,
 * deduplicates against prior ingests (the same filing is often hosted at both
 * OGE and the White House), stores the raw PDF for provenance, and writes a
 * `pending` filing row for the parser to pick up.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/db";
import { filings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchBytes } from "../lib/http";
import { ensurePresident } from "../lib/persons";
import type { FilingCandidate } from "./discover";

const PDF_DIR = join(process.cwd(), "data", "pdfs");

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function hashExists(hash: string): Promise<boolean> {
  const rows = await db
    .select({ id: filings.id })
    .from(filings)
    .where(eq(filings.pdfHash, hash))
    .limit(1);
  return rows.length > 0;
}

export interface FetchResult {
  fetched: number;
  duplicates: number;
  errors: string[];
}

/** Download, hash, dedup, store, and register the given filing candidates. */
export async function fetchFilings(candidates: FilingCandidate[]): Promise<FetchResult> {
  await mkdir(PDF_DIR, { recursive: true });
  const personId = await ensurePresident();
  const result: FetchResult = { fetched: 0, duplicates: 0, errors: [] };

  for (const c of candidates) {
    try {
      const bytes = await fetchBytes(c.sourceUrl, { timeoutMs: 120_000 });
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new Error(`not a PDF (got ${bytes.subarray(0, 16).toString("latin1")})`);
      }
      const hash = sha256(bytes);
      if (await hashExists(hash)) {
        result.duplicates++;
        console.log(`[fetch] duplicate (hash match): ${c.label}`);
        continue;
      }
      const path = join(PDF_DIR, `${hash}.pdf`);
      await writeFile(path, bytes);

      await db.insert(filings).values({
        personId,
        formType: c.formType,
        ogeUnid: c.ogeUnid ?? null,
        filingDate: c.filingDate,
        sourceUrl: c.sourceUrl,
        sourceDomain: c.sourceDomain,
        pdfHash: hash,
        rawPdfPath: path,
        status: "pending",
      });
      result.fetched++;
      console.log(`[fetch] stored ${c.label} (${(bytes.length / 1024).toFixed(0)} KB, ${hash.slice(0, 12)}…)`);
    } catch (err) {
      const msg = `${c.label}: ${String(err)}`;
      result.errors.push(msg);
      console.error(`[fetch] ERROR ${msg}`);
    }
  }
  return result;
}
