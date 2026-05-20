/**
 * Stage 6 — Enrich.
 *
 * Two passes:
 *   1. Ticker resolution — equity transaction descriptions → ticker + company
 *      via the SEC EDGAR `company_tickers.json` map. Municipal bonds (most of
 *      the President's 278-T volume) legitimately do not resolve and are left
 *      unlinked rather than force-matched.
 *   2. Company profiles — for each resolved company, the SEC EDGAR submissions
 *      API fills the official name, SIC industry, and a coarse sector.
 *
 * Price enrichment (Tiingo / FMP) activates when those API keys are present.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/db";
import { companies, filings, transactions } from "@/db/schema";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { fetchJson } from "../lib/http";

const CACHE_DIR = join(process.cwd(), "data", "cache");
const EDGAR_TICKERS = "https://www.sec.gov/files/company_tickers.json";
const EDGAR_SUBMISSIONS = (cik: string) =>
  `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  "disclosure-ledger civic-transparency project (contact: benjamin@opencivics.co)";

interface EdgarEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

const NON_EQUITY = /\b(DUE|REV|B\/E|OID|CTF|RFDG|RFUNDING|MUN|MTN|NOTE|BOND|GO\b|G\/O|SER\b|@\d)/i;

function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/\b(THE|COM|COMMON|STOCK|CL\s?[A-C]|INC|CORP|CORPORATION|CO|COMPANY|LTD|PLC|HOLDINGS?|GROUP|N\.?V\.?|S\.?A\.?)\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a 4-digit SIC code to a coarse industry sector (SIC division). */
function sicToSector(sic: number): string {
  if (sic >= 100 && sic <= 999) return "Agriculture & Natural Resources";
  if (sic >= 1000 && sic <= 1499) return "Mining & Extraction";
  if (sic >= 1500 && sic <= 1799) return "Construction";
  if (sic >= 2000 && sic <= 3999) return "Manufacturing";
  if (sic >= 4000 && sic <= 4999) return "Transportation & Utilities";
  if (sic >= 5000 && sic <= 5199) return "Wholesale Trade";
  if (sic >= 5200 && sic <= 5999) return "Retail Trade";
  if (sic >= 6000 && sic <= 6799) return "Finance, Insurance & Real Estate";
  if (sic >= 7000 && sic <= 8999) return "Services";
  if (sic >= 9100) return "Public Administration";
  return "Other";
}

async function loadEdgarMap(): Promise<Map<string, EdgarEntry>> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, "company_tickers.json");
  let raw: Record<string, EdgarEntry>;
  try {
    raw = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    raw = await fetchJson<Record<string, EdgarEntry>>(EDGAR_TICKERS);
    await writeFile(cachePath, JSON.stringify(raw));
  }
  const byName = new Map<string, EdgarEntry>();
  for (const e of Object.values(raw)) {
    const key = normalizeName(e.title);
    if (key && !byName.has(key)) byName.set(key, e);
  }
  return byName;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EnrichResult {
  resolved: number;
  unresolved: number;
  bondsSkipped: number;
  profilesFilled: number;
}

/** Pass 1 — resolve tickers for unlinked transactions in non-superseded filings. */
async function resolveTickers(
  edgar: Map<string, EdgarEntry>,
  result: EnrichResult,
): Promise<void> {
  const pending = await db
    .select({ id: transactions.id, desc: transactions.descriptionRaw })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(
      and(
        isNull(transactions.companyId),
        inArray(filings.status, ["parsed", "published"]),
      ),
    );

  const companyByTicker = new Map<string, string>();

  for (const txn of pending) {
    if (NON_EQUITY.test(txn.desc)) {
      result.bondsSkipped++;
      continue;
    }
    const key = normalizeName(txn.desc);
    let match: EdgarEntry | undefined = edgar.get(key);
    if (!match) {
      for (const [name, entry] of edgar) {
        if (name.length >= 5 && (key.startsWith(name + " ") || key === name)) {
          match = entry;
          break;
        }
      }
    }
    if (!match) {
      result.unresolved++;
      continue;
    }

    let companyId = companyByTicker.get(match.ticker);
    if (!companyId) {
      const existing = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.ticker, match.ticker))
        .limit(1);
      if (existing[0]) {
        companyId = existing[0].id;
      } else {
        const [row] = await db
          .insert(companies)
          .values({
            name: match.title,
            ticker: match.ticker,
            cik: String(match.cik_str).padStart(10, "0"),
          })
          .returning({ id: companies.id });
        companyId = row.id;
      }
      companyByTicker.set(match.ticker, companyId);
    }
    await db.update(transactions).set({ companyId }).where(eq(transactions.id, txn.id));
    result.resolved++;
  }
}

/** Pass 2 — fill sector/industry/description for companies that lack them. */
async function fillProfiles(result: EnrichResult): Promise<void> {
  // Only companies actually linked to a public transaction are worth a lookup.
  const toEnrich = await db
    .selectDistinct({ id: companies.id, cik: companies.cik, name: companies.name })
    .from(companies)
    .innerJoin(transactions, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(
      and(
        isNotNull(companies.cik),
        isNull(companies.sector),
        inArray(filings.status, ["parsed", "published"]),
      ),
    );

  for (const c of toEnrich) {
    if (!c.cik) continue;
    try {
      const res = await fetch(EDGAR_SUBMISSIONS(c.cik), {
        headers: { "User-Agent": USER_AGENT },
      });
      await sleep(140); // well within SEC's 10 req/s limit
      if (!res.ok) continue;
      const sub = (await res.json()) as {
        name?: string;
        sic?: string;
        sicDescription?: string;
        description?: string;
      };
      const sicCode = Number(sub.sic ?? 0);
      const industry = sub.sicDescription ?? null;
      const sector = sicCode ? sicToSector(sicCode) : null;
      const description =
        industry && sub.name
          ? `${sub.name} — ${industry}.`
          : null;
      await db
        .update(companies)
        .set({
          name: sub.name ?? c.name,
          sector,
          industry,
          description,
        })
        .where(eq(companies.id, c.id));
      if (sector) result.profilesFilled++;
    } catch {
      // Leave the profile unfilled; a later run retries.
    }
  }
}

/** Run both enrichment passes. */
export async function enrichTransactions(): Promise<EnrichResult> {
  const result: EnrichResult = {
    resolved: 0,
    unresolved: 0,
    bondsSkipped: 0,
    profilesFilled: 0,
  };
  const edgar = await loadEdgarMap();
  await resolveTickers(edgar, result);
  await fillProfiles(result);
  console.log(
    `[enrich] ${result.resolved} tickers resolved, ${result.profilesFilled} profiles filled, ` +
      `${result.bondsSkipped} bonds skipped`,
  );
  return result;
}
