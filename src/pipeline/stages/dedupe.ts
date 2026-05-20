/**
 * Stage 2b — Deduplicate filings (source-quality preference).
 *
 * The same logical filing is frequently hosted at both the Office of
 * Government Ethics (extapps2.oge.gov) and whitehouse.gov. They are different
 * scans — different bytes, so byte-hash dedup does not catch them — and the
 * OGE copies are consistently the higher-quality scan.
 *
 * Rule: within each (filer, filing date, form type) group, if any OGE-hosted
 * filing exists, every non-OGE filing in that group is marked `superseded`
 * (and excluded from the public view). Groups with no OGE copy are untouched.
 *
 * Idempotent: re-running re-derives the same outcome.
 */
import { db } from "@/db";
import { filings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const OGE_DOMAIN = "extapps2.oge.gov";

export interface DedupeResult {
  superseded: number;
  groups: number;
}

export async function dedupeFilings(): Promise<DedupeResult> {
  const all = await db
    .select({
      id: filings.id,
      domain: filings.sourceDomain,
      date: filings.filingDate,
      form: filings.formType,
      status: filings.status,
    })
    .from(filings);

  // Group by (filing date, form type). The President is the only filer in v1.
  const groups = new Map<string, typeof all>();
  for (const f of all) {
    const key = `${f.date}|${f.form}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(f);
  }

  const result: DedupeResult = { superseded: 0, groups: groups.size };

  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const ogeFilings = members.filter((m) => m.domain === OGE_DOMAIN);
    if (ogeFilings.length === 0) continue; // no preferred copy — keep all

    const canonical = ogeFilings[0].id;
    for (const m of members) {
      if (m.domain === OGE_DOMAIN) continue;
      if (m.status === "superseded") continue;
      await db
        .update(filings)
        .set({ status: "superseded", supersedesId: canonical })
        .where(eq(filings.id, m.id));
      result.superseded++;
    }
  }

  console.log(
    `[dedupe] ${result.superseded} filing(s) superseded by higher-quality OGE copies`,
  );
  return result;
}

export async function activeFilingCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(filings)
    .where(sql`${filings.status} <> 'superseded'`);
  return Number(row?.n ?? 0);
}
