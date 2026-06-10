/**
 * Stage 4c — Ingest the American Presidency Project (UCSB) — FR-S1 priority 1.
 *
 * APP is the *timely* curated source of spoken remarks (CPD is authoritative
 * but lags days–weeks; APP usually posts within a day). Polite structured
 * scrape: the spoken-addresses-and-remarks category listing, then each
 * document page, filtered strictly to documents attributed to Donald Trump.
 * No API key; rate-limited and identified by the shared polite HTTP client.
 *
 * Attribution discipline (FR-S3): only single-speaker titles are ingested
 * (shared filter with CPD); interviews/news conferences are deferred to the
 * speaker-segmentation layer. When CPD later publishes the same event, the
 * CPD reconciler supersedes the APP copy with the official text (FR-S6).
 *
 * Parsing is defensive — APP is a scraped third party, so every extractor
 * tolerates markup drift and the stage reports zero-yield loudly rather than
 * failing silently.
 */
import { createHash } from "node:crypto";
import { db } from "@/db";
import { statements } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { fetchText } from "../lib/http";
import { ensurePresident } from "../lib/persons";
import { isSingleSpeakerTitle } from "../lib/statement-filters";

const BASE = "https://www.presidency.ucsb.edu";
const LISTING = `${BASE}/documents/app-categories/spoken-addresses-and-remarks/presidential`;
/** Trump's second term began 2025-01-20 — the backfill floor. */
const TERM_START = "2025-01-20";
/** Listing pages to scan per run (60 documents each, newest first). */
const MAX_LISTING_PAGES = 5;

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

export function parseLongDate(s: string): string | null {
  const m = s.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (!m) return null;
  return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
}

/** Document links from a category listing page. */
export function extractListingLinks(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(\/documents\/[a-z0-9][a-z0-9-]+)"/gi)) {
    // category/listing paths also live under /documents/ — exclude them
    if (m[1].startsWith("/documents/app-categories")) continue;
    out.add(m[1]);
  }
  return [...out];
}

function stripTags(html: string): string {
  return html
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

export interface AppDocument {
  title: string;
  date: string;
  person: string;
  body: string;
}

/** Parse an APP document page; null when any required field is missing. */
export function parseAppDocument(html: string): AppDocument | null {
  const title =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<title>([\s\S]*?)(?:\s*\|[^|]*)?<\/title>/i)?.[1];
  if (!title) return null;

  // The byline block names the speaker; APP marks it with field-docs-person
  // (fall back to a generic "by <name>" pattern if the class drifts).
  const personBlock =
    html.match(/field-docs-person[\s\S]{0,800}?<\/div>/i)?.[0] ??
    html.match(/<h3[^>]*class="[^"]*diet-title[^"]*"[\s\S]{0,300}?<\/h3>/i)?.[0] ??
    "";
  const person = stripTags(personBlock);

  const dateBlock =
    html.match(/date-display-single[^>]*>([\s\S]*?)<\/span>/i)?.[1] ??
    html.match(/field-docs-start-date-time[\s\S]{0,400}?<\/div>/i)?.[0] ??
    html;
  const date = parseLongDate(stripTags(dateBlock).slice(0, 400));
  if (!date) return null;

  const bodyBlock = html.match(/field-docs-content[\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1];
  const body = stripTags(bodyBlock ?? "");
  if (body.length < 120) return null;

  return { title: stripTags(title), date, person, body };
}

export interface AppResult {
  ingested: number;
  skipped: number;
  deferredMultiSpeaker: number;
  notTrump: number;
  errors: string[];
}

export async function ingestApp(): Promise<AppResult> {
  const result: AppResult = {
    ingested: 0,
    skipped: 0,
    deferredMultiSpeaker: 0,
    notTrump: 0,
    errors: [],
  };
  const personId = await ensurePresident();

  // Incremental floor: a few days before the newest APP statement on record.
  const [latest] = await db
    .select({ d: statements.spokenAt })
    .from(statements)
    .where(eq(statements.source, "app"))
    .orderBy(desc(statements.spokenAt))
    .limit(1);
  const floor = latest?.d
    ? new Date(Date.parse(latest.d) - 3 * 86_400_000).toISOString().slice(0, 10)
    : TERM_START;

  const links = new Set<string>();
  for (let page = 0; page < MAX_LISTING_PAGES; page++) {
    try {
      const html = await fetchText(`${LISTING}?items_per_page=60&page=${page}`, {
        retries: 1,
        timeoutMs: 30_000,
      });
      const found = extractListingLinks(html);
      if (found.length === 0) {
        result.errors.push(`listing page ${page}: zero document links (markup drift?)`);
        break;
      }
      for (const l of found) links.add(l);
      // Stop paging once the page's dates fall below the floor.
      const dates = [...html.matchAll(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/g,
      )].map((m) => parseLongDate(m[0])!);
      if (dates.length > 0 && dates.every((d) => d < floor)) break;
    } catch (err) {
      result.errors.push(`listing page ${page}: ${String(err)}`);
      break;
    }
  }

  for (const path of links) {
    try {
      const url = `${BASE}${path}`;
      const contentHash = createHash("sha256").update(`app:${path}`).digest("hex");
      const exists = await db
        .select({ id: statements.id })
        .from(statements)
        .where(eq(statements.contentHash, contentHash))
        .limit(1);
      if (exists.length > 0) {
        result.skipped++;
        continue;
      }

      const html = await fetchText(url, { retries: 1, timeoutMs: 30_000 });
      const doc = parseAppDocument(html);
      if (!doc || doc.date < floor) {
        result.skipped++;
        continue;
      }
      // Strict person filter — the listing covers every president.
      if (!/donald\s+(j\.?\s+)?trump/i.test(doc.person)) {
        result.notTrump++;
        continue;
      }
      if (!isSingleSpeakerTitle(doc.title)) {
        result.deferredMultiSpeaker++;
        continue;
      }

      await db
        .insert(statements)
        .values({
          personId,
          spokenAt: doc.date,
          channel: "remarks",
          venue: doc.title.slice(0, 200),
          fullText: doc.body.slice(0, 60_000),
          source: "app",
          sourceUrl: url,
          sourceRef: path,
          attributionMethod: "official_transcript",
          attributionConf: 1,
          contentHash,
        })
        .onConflictDoNothing({ target: statements.contentHash });
      result.ingested++;
    } catch (err) {
      result.errors.push(`${path}: ${String(err)}`);
    }
  }

  console.log(
    `[ingest-app] ${result.ingested} new, ${result.skipped} known, ` +
      `${result.deferredMultiSpeaker} multi-speaker deferred, ${result.notTrump} other speakers skipped`,
  );
  return result;
}

export async function appCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(statements)
    .where(eq(statements.source, "app"));
  return Number(row?.n ?? 0);
}
