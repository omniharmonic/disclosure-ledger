/**
 * Stage 5 — Ingest official actions.
 *
 * Pulls presidential documents (executive orders, proclamations, memoranda)
 * from the Federal Register API — public, no key required — into the `actions`
 * table. Each action is deduplicated by its Federal Register document number.
 *
 * Action→company linking is performed by the mention/linking pass once the
 * company universe exists; this stage only ingests the actions themselves.
 */
import { db } from "@/db";
import { actions } from "@/db/schema";
import { sql } from "drizzle-orm";
import { fetchJson } from "../lib/http";

/** Trump's second term began 2025-01-20 — the floor for ingestion. */
const SINCE = "2025-01-20";
const FR_API = "https://www.federalregister.gov/api/v1/documents.json";

interface FrDocument {
  document_number: string;
  title: string;
  type: string;
  publication_date: string;
  signing_date: string | null;
  abstract: string | null;
  html_url: string;
}

interface FrResponse {
  count: number;
  next_page_url: string | null;
  results: FrDocument[];
}

/** The Federal Register encodes the subtype in the title, e.g. "Executive Order 14110—…". */
function actionTypeOf(doc: FrDocument): string {
  const t = doc.title.toLowerCase();
  if (t.startsWith("executive order")) return "executive_order";
  if (t.startsWith("proclamation")) return "proclamation";
  if (t.startsWith("memorandum")) return "memorandum";
  if (t.includes("notice")) return "notice";
  if (t.includes("determination")) return "determination";
  return "presidential_document";
}

export interface ActionsResult {
  ingested: number;
  skipped: number;
  errors: string[];
}

/** Ingest presidential documents from the Federal Register. */
export async function ingestActions(): Promise<ActionsResult> {
  const result: ActionsResult = { ingested: 0, skipped: 0, errors: [] };

  const fields = [
    "document_number",
    "title",
    "type",
    "publication_date",
    "signing_date",
    "abstract",
    "html_url",
  ];
  const params = new URLSearchParams({
    "conditions[type]": "PRESDOCU",
    "conditions[publication_date][gte]": SINCE,
    per_page: "100", // Federal Register API rejects larger page sizes
    order: "newest",
  });
  for (const f of fields) params.append("fields[]", f);

  let url: string | null = `${FR_API}?${params.toString()}`;
  let pages = 0;

  while (url && pages < 20) {
    const page: FrResponse = await fetchJson<FrResponse>(url);
    pages++;
    for (const doc of page.results) {
      try {
        const inserted = await db
          .insert(actions)
          .values({
            actionType: actionTypeOf(doc),
            occurredOn: doc.publication_date,
            signedOn: doc.signing_date,
            title: doc.title,
            summary: doc.abstract,
            source: "federal_register",
            sourceRef: doc.document_number,
            sourceUrl: doc.html_url,
          })
          .onConflictDoNothing({ target: [actions.source, actions.sourceRef] })
          .returning({ id: actions.id });
        if (inserted.length > 0) result.ingested++;
        else result.skipped++;
      } catch (err) {
        result.errors.push(`${doc.document_number}: ${String(err)}`);
      }
    }
    url = page.next_page_url;
  }

  console.log(
    `[ingest-actions] ${result.ingested} new, ${result.skipped} already present`,
  );
  return result;
}

/** Total presidential actions on record. */
export async function actionCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(actions);
  return Number(row?.n ?? 0);
}
