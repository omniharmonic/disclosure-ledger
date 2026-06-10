/**
 * Stage 4b — Ingest the Compilation of Presidential Documents (govinfo).
 *
 * The CPD is the *authoritative* verbatim record of presidential statements —
 * the citable source the journalist persona needs (PRD G2, FR-S1 priority 2).
 * It lags days–weeks behind events but its text wins on conflict.
 *
 * Requires DATA_GOV_API_KEY (free, instant at api.data.gov/signup); a logged
 * no-op without it, like every key-gated stage.
 *
 * Attribution discipline (FR-S3): only single-speaker document categories
 * (Remarks, Addresses, Statements, Messages…) are auto-ingested as
 * `official_transcript`. Multi-speaker categories (interviews, news
 * conferences, exchanges with reporters) are SKIPPED in v1 — their text mixes
 * reporters' words with the President's, and ingesting them without the
 * speaker-segmentation layer would risk misattribution, the highest-severity
 * defect class.
 */
import { createHash } from "node:crypto";
import { db } from "@/db";
import { statements } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { fetchJson, fetchText } from "../lib/http";
import { ensurePresident } from "../lib/persons";

const API = "https://api.govinfo.gov";
/** Trump's second term began 2025-01-20 — the backfill floor. */
const TERM_START = "2025-01-20";

/** Single-speaker title prefixes safe to auto-attribute. */
const SINGLE_SPEAKER = /^(remarks|address|statement|message|commencement|inaugural|letter)/i;
/** Multi-speaker categories deferred to the speaker-segmentation layer. */
const MULTI_SPEAKER =
  /(news conference|interview|exchange with reporters|question-and-answer|town hall|debate)/i;

interface CpdPackage {
  packageId: string; // DCPD-YYYYNNNNN
  title?: string;
  dateIssued?: string;
  packageLink?: string;
}

interface CpdCollectionPage {
  count: number;
  nextPage: string | null;
  packages: CpdPackage[];
}

function withKey(url: string, key: string): string {
  return url.includes("api_key=") ? url : `${url}${url.includes("?") ? "&" : "?"}api_key=${key}`;
}

/** Strip the govinfo HTM rendition down to plain text. */
function htmToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function channelOf(title: string): string {
  const t = title.toLowerCase();
  if (t.startsWith("remarks")) return "remarks";
  if (t.startsWith("address")) return "address";
  if (t.startsWith("statement")) return "statement";
  if (t.startsWith("message") || t.startsWith("letter")) return "message";
  return "document";
}

export interface CpdResult {
  ingested: number;
  skipped: number;
  deferredMultiSpeaker: number;
  errors: string[];
}

export async function ingestCpd(): Promise<CpdResult> {
  const result: CpdResult = { ingested: 0, skipped: 0, deferredMultiSpeaker: 0, errors: [] };

  const key = process.env.DATA_GOV_API_KEY;
  if (!key) {
    console.log("[ingest-cpd] skipped — no DATA_GOV_API_KEY (free at api.data.gov/signup)");
    return result;
  }

  const personId = await ensurePresident();

  // Incremental window: a week before the newest CPD statement on record.
  const [latest] = await db
    .select({ d: statements.spokenAt })
    .from(statements)
    .where(eq(statements.source, "cpd"))
    .orderBy(desc(statements.spokenAt))
    .limit(1);
  const sinceDate = latest?.d
    ? new Date(Date.parse(latest.d) - 7 * 86_400_000).toISOString().slice(0, 10)
    : TERM_START;
  const since = `${sinceDate}T00:00:00Z`;
  const until = new Date().toISOString().slice(0, 19) + "Z";

  let url: string | null = withKey(
    `${API}/collections/CPD/${since}/${until}?pageSize=100&offsetMark=*`,
    key,
  );
  let pages = 0;

  while (url && pages < 30) {
    let page: CpdCollectionPage;
    try {
      page = await fetchJson<CpdCollectionPage>(url, { timeoutMs: 45_000 });
    } catch (err) {
      result.errors.push(`collections page ${pages}: ${String(err)}`);
      break;
    }
    pages++;

    for (const pkg of page.packages ?? []) {
      try {
        const title = pkg.title ?? "";
        if (!pkg.packageId || !pkg.dateIssued) {
          result.skipped++;
          continue;
        }
        // EOs/proclamations arrive from the Federal Register with cleaner
        // metadata; CPD here is for *statements*.
        if (/^(executive order|proclamation|memorandum|notice)/i.test(title)) {
          result.skipped++;
          continue;
        }
        if (MULTI_SPEAKER.test(title) || !SINGLE_SPEAKER.test(title)) {
          result.deferredMultiSpeaker++;
          continue;
        }

        const contentHash = createHash("sha256")
          .update(`cpd:${pkg.packageId}`)
          .digest("hex");
        const exists = await db
          .select({ id: statements.id })
          .from(statements)
          .where(eq(statements.contentHash, contentHash))
          .limit(1);
        if (exists.length > 0) {
          result.skipped++;
          continue;
        }

        const htm = await fetchText(withKey(`${API}/packages/${pkg.packageId}/htm`, key), {
          timeoutMs: 45_000,
          retries: 1,
        });
        const fullText = htmToText(htm);
        if (fullText.length < 120) {
          result.skipped++;
          continue;
        }

        await db
          .insert(statements)
          .values({
            personId,
            spokenAt: pkg.dateIssued.slice(0, 10),
            channel: channelOf(title),
            venue: title.slice(0, 200),
            fullText: fullText.slice(0, 60_000),
            source: "cpd",
            sourceUrl: `https://www.govinfo.gov/app/details/${pkg.packageId}`,
            sourceRef: pkg.packageId,
            attributionMethod: "official_transcript",
            attributionConf: 1,
            contentHash,
          })
          .onConflictDoNothing({ target: statements.contentHash });
        result.ingested++;
      } catch (err) {
        result.errors.push(`${pkg.packageId}: ${String(err)}`);
      }
    }

    url = page.nextPage ? withKey(page.nextPage, key) : null;
  }

  console.log(
    `[ingest-cpd] ${result.ingested} new, ${result.skipped} skipped, ` +
      `${result.deferredMultiSpeaker} multi-speaker deferred (need segmentation layer)`,
  );
  return result;
}

export async function cpdCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(statements)
    .where(eq(statements.source, "cpd"));
  return Number(row?.n ?? 0);
}
