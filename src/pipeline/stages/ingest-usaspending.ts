/**
 * Stage 5c — Ingest federal contract awards from USAspending (FR-A2).
 *
 * For each company in the traded universe, queries prime awards naming it as
 * recipient since the start of the term, and stores them as `contract`
 * actions linked via `action_targets` (link_method = contract_recipient).
 * No API key required.
 *
 * Precision: USAspending recipient search is fuzzy, so a returned award is
 * accepted only when the recipient name actually contains the company's
 * distinctive name token(s) — a "Apple Inc" search must not attach an award
 * to "Appleton Partners".
 */
import { db } from "@/db";
import { actions, actionTargets, companies, filings, transactions } from "@/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { fetchJsonPost } from "../lib/http";

const API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
/** Trump's second term began 2025-01-20 — the ingestion floor. */
const SINCE = "2025-01-20";
/** Prime award type codes: A–D = contracts. */
const CONTRACT_TYPES = ["A", "B", "C", "D"];
const PAGE_LIMIT = 50;
const MAX_PAGES_PER_COMPANY = 2;

interface AwardRow {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Start Date"?: string;
  "Award Amount"?: number;
  "Awarding Agency"?: string;
  generated_internal_id?: string;
}

interface AwardResponse {
  results?: AwardRow[];
  page_metadata?: { hasNext?: boolean };
}

/** Distinctive tokens of a company name (drops legal/structural suffixes). */
function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !["CORP", "CORPORATION", "COMPANY", "HOLDINGS", "GROUP", "TRUST", "LIMITED"].includes(w),
    );
}

/** Does the award's recipient genuinely match the company? */
export function recipientMatches(companyName: string, recipientName: string): boolean {
  const tokens = nameTokens(companyName);
  if (tokens.length === 0) return false;
  const recipient = recipientName.toUpperCase();
  // The first distinctive token must appear; for multi-token names require two.
  const required = Math.min(2, tokens.length);
  return tokens.slice(0, required).every((t) => recipient.includes(t));
}

export interface UsaSpendingResult {
  companiesQueried: number;
  ingested: number;
  skipped: number;
  rejectedFuzzy: number;
  errors: string[];
}

export async function ingestUsaSpending(): Promise<UsaSpendingResult> {
  const result: UsaSpendingResult = {
    companiesQueried: 0,
    ingested: 0,
    skipped: 0,
    rejectedFuzzy: 0,
    errors: [],
  };

  // Only companies actually linked to a public transaction.
  const universe = await db
    .selectDistinct({ id: companies.id, name: companies.name })
    .from(companies)
    .innerJoin(transactions, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(and(isNotNull(companies.ticker), inArray(filings.status, ["parsed", "published"])));

  for (const company of universe) {
    result.companiesQueried++;
    const searchText = nameTokens(company.name).slice(0, 2).join(" ");
    if (!searchText) continue;

    for (let page = 1; page <= MAX_PAGES_PER_COMPANY; page++) {
      let res: AwardResponse;
      try {
        res = await fetchJsonPost<AwardResponse>(API, {
          filters: {
            time_period: [{ start_date: SINCE, end_date: new Date().toISOString().slice(0, 10) }],
            award_type_codes: CONTRACT_TYPES,
            recipient_search_text: [searchText],
          },
          fields: [
            "Award ID",
            "Recipient Name",
            "Start Date",
            "Award Amount",
            "Awarding Agency",
          ],
          limit: PAGE_LIMIT,
          page,
          order: "desc",
          sort: "Award Amount",
        });
      } catch (err) {
        result.errors.push(`${company.name}: ${String(err)}`);
        break;
      }

      for (const award of res.results ?? []) {
        const recipient = award["Recipient Name"] ?? "";
        const awardId = award["Award ID"] ?? award.generated_internal_id;
        const startDate = award["Start Date"];
        if (!awardId || !startDate) {
          result.skipped++;
          continue;
        }
        if (!recipientMatches(company.name, recipient)) {
          result.rejectedFuzzy++;
          continue;
        }
        const amount = award["Award Amount"];
        const agency = award["Awarding Agency"] ?? "federal agency";
        const sourceRef = award.generated_internal_id ?? `award:${awardId}`;
        try {
          const inserted = await db
            .insert(actions)
            .values({
              actionType: "contract",
              occurredOn: startDate.slice(0, 10),
              title: `Federal contract: ${recipient} — ${agency} (${awardId})`,
              summary:
                amount != null
                  ? `Prime contract award of $${Math.round(amount).toLocaleString()} to ${recipient} by ${agency}.`
                  : `Prime contract award to ${recipient} by ${agency}.`,
              source: "usaspending",
              sourceRef,
              sourceUrl: award.generated_internal_id
                ? `https://www.usaspending.gov/award/${encodeURIComponent(award.generated_internal_id)}`
                : "https://www.usaspending.gov/search",
            })
            .onConflictDoNothing({ target: [actions.source, actions.sourceRef] })
            .returning({ id: actions.id });

          if (inserted.length > 0) {
            await db.insert(actionTargets).values({
              actionId: inserted[0].id,
              companyId: company.id,
              linkMethod: "contract_recipient",
              confidence: 0.8,
            });
            result.ingested++;
          } else {
            result.skipped++;
          }
        } catch (err) {
          result.errors.push(`${awardId}: ${String(err)}`);
        }
      }

      if (!res.page_metadata?.hasNext) break;
    }
  }

  console.log(
    `[ingest-usaspending] ${result.ingested} contract awards across ` +
      `${result.companiesQueried} companies (${result.rejectedFuzzy} fuzzy matches rejected)`,
  );
  return result;
}

export async function contractCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(actions)
    .where(sql`${actions.source} = 'usaspending'`);
  return Number(row?.n ?? 0);
}
