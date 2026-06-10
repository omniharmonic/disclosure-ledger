/**
 * Stage 1 — Discover.
 *
 * Finds candidate President filings from three independent channels:
 *   1. The curated seed list (always).
 *   2. The White House uploads pages (best-effort monitor).
 *   3. The OGE `PAS+Index` appointee view — best-effort, primarily for the
 *      future Cabinet/appointee expansion; the President himself is not in it.
 *
 * Discovery only produces candidates; the `fetch` stage downloads, hashes,
 * deduplicates, and writes filing rows.
 */
import { db } from "@/db";
import { filings } from "@/db/schema";
import { PRESIDENT_FILING_SEEDS } from "../lib/seeds";
import { fetchJson, fetchText } from "../lib/http";
import { parseDominoEntries, ogeCandidatesFrom, ogePdfUrl } from "../lib/oge-domino";

export interface FilingCandidate {
  filerName: string;
  formType: string;
  filingDate: string;
  sourceUrl: string;
  sourceDomain: string;
  ogeUnid?: string;
  label: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

/**
 * Parse an `M.D.YY` / `MM.DD.YYYY` date embedded in a White House filename
 * (e.g. "...-Report-2.26.26-1.pdf" -> "2026-02-26"). Returns null if absent.
 */
function dateFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!m) return null;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  const iso = `${yyyy}-${mm}-${dd}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * White House periodic-transaction-report PDFs.
 *
 * The White House disclosures pages list filings for *every* appointee, so the
 * monitor must filter strictly to the President — a filename containing
 * "Trump" or the "President-Donald-J" prefix. (Appointee coverage is a v1.x
 * concern; mislabelling another official's filing as the President's would
 * corrupt the dataset.)
 */
async function discoverWhiteHouse(): Promise<FilingCandidate[]> {
  const out: FilingCandidate[] = [];
  const indexPages = [
    "https://www.whitehouse.gov/disclosures/",
    "https://www.whitehouse.gov/briefings-statements/",
  ];
  for (const page of indexPages) {
    try {
      const html = await fetchText(page, { retries: 1, timeoutMs: 20_000 });
      const re =
        /https:\/\/www\.whitehouse\.gov\/wp-content\/uploads\/[^"' ]*?\.pdf/gi;
      for (const m of html.matchAll(re)) {
        const url = m[0];
        const filename = decodeURIComponent(url.split("/").pop() ?? "");
        // President-only filter.
        if (!/trump/i.test(filename) || !/president[-\s.]*donald/i.test(filename)) continue;
        if (!/(periodic[-\s]*transaction[-\s]*report|278)/i.test(filename)) continue;
        const formType = /278[-\s]*e\b|annual/i.test(filename) ? "278e" : "278-T";
        const filingDate = dateFromFilename(filename) ?? new Date().toISOString().slice(0, 10);
        out.push({
          filerName: "Donald J. Trump",
          formType,
          filingDate,
          sourceUrl: url,
          sourceDomain: domainOf(url),
          label: `White House: ${filename}`,
        });
      }
    } catch (err) {
      console.warn(`[discover] White House page ${page} unavailable: ${String(err)}`);
    }
  }
  return out;
}

/**
 * Poll the OGE Domino `PAS+Index` view as JSON (FR-T1). The President is not
 * in this appointee view, so for v1 this is a redundant channel that exists
 * to (a) catch any future restructuring that does list him and (b) carry the
 * Cabinet/appointee expansion (G8) — extend the filer regex per tracked
 * person. Best-effort: a failure is logged, never fatal to discovery.
 */
async function discoverOgeView(): Promise<FilingCandidate[]> {
  const out: FilingCandidate[] = [];
  const url =
    "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?ReadViewEntries&OutputFormat=JSON&Count=-1";
  try {
    const json = await fetchJson<unknown>(url, { retries: 1, timeoutMs: 45_000 });
    const entries = parseDominoEntries(json);
    const candidates = ogeCandidatesFrom(entries, /trump,?\s+donald|donald\s+(j\.?\s+)?trump/i);
    for (const c of candidates) {
      if (!c.filename) continue; // no attachment column — nothing fetchable
      const sourceUrl = ogePdfUrl(c.unid, c.filename);
      out.push({
        filerName: c.filerName,
        formType: c.formType,
        filingDate: c.filingDate,
        sourceUrl,
        sourceDomain: domainOf(sourceUrl),
        ogeUnid: c.unid,
        label: `OGE view: ${c.filename}`,
      });
    }
    console.log(`[discover] OGE view: ${entries.length} entries, ${out.length} tracked-filer 278s`);
  } catch (err) {
    console.warn(`[discover] OGE view unavailable (expected redundancy): ${String(err)}`);
  }
  return out;
}

/** All filing source URLs already known to the database. */
async function knownSourceUrls(): Promise<Set<string>> {
  const rows = await db.select({ url: filings.sourceUrl }).from(filings);
  return new Set(rows.map((r) => r.url));
}

/** Run discovery; returns candidates not already present by sourceUrl. */
export async function discover(): Promise<FilingCandidate[]> {
  const seen = await knownSourceUrls();
  const candidates: FilingCandidate[] = [];

  for (const seed of PRESIDENT_FILING_SEEDS) {
    candidates.push({
      filerName: seed.filerName,
      formType: seed.formType,
      filingDate: seed.filingDate,
      sourceUrl: seed.sourceUrl,
      sourceDomain: domainOf(seed.sourceUrl),
      ogeUnid: seed.ogeUnid,
      label: seed.label,
    });
  }

  candidates.push(...(await discoverWhiteHouse()));
  candidates.push(...(await discoverOgeView()));

  // Deduplicate by sourceUrl, drop anything already ingested.
  const unique = new Map<string, FilingCandidate>();
  for (const c of candidates) {
    if (seen.has(c.sourceUrl)) continue;
    if (!unique.has(c.sourceUrl)) unique.set(c.sourceUrl, c);
  }
  const fresh = [...unique.values()];
  console.log(
    `[discover] ${candidates.length} candidates scanned, ${fresh.length} new (not yet ingested)`,
  );
  return fresh;
}
