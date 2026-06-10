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
import { verifyPdfSignature } from "../lib/pdf-signature";
import { archivePdf } from "../lib/object-storage";
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

      // Cryptographic signature verification (FR-T3): document integrity
      // against the embedded certificate. Never blocks ingestion — the
      // result is provenance, surfaced on the filing page.
      const sig = await verifyPdfSignature(bytes);
      if (sig.present) {
        console.log(
          `[fetch]   signature: ${sig.verified === true ? "verified" : sig.verified === false ? "FAILED" : "present, not evaluable"}` +
            (sig.signer ? ` (signer: ${sig.signer})` : "") +
            (sig.note ? ` — ${sig.note}` : ""),
        );
      }

      // Durable provenance mirror (W-9) — no-op unless PDF_ARCHIVE_* is set.
      const archiveUrl = await archivePdf(hash, bytes);

      await db.insert(filings).values({
        personId,
        formType: c.formType,
        ogeUnid: c.ogeUnid ?? null,
        filingDate: c.filingDate,
        sourceUrl: c.sourceUrl,
        sourceDomain: c.sourceDomain,
        pdfHash: hash,
        rawPdfPath: path,
        archiveUrl,
        signaturePresent: sig.present,
        signatureVerified: sig.verified,
        signatureSigner: sig.signer,
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
