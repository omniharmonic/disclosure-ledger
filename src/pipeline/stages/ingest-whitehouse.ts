/**
 * Stage 5b — Ingest White House statements.
 *
 * The White House reliably publishes fact sheets and articles that name
 * specific companies and contracts (e.g. a "Golden Dome" missile-defense fact
 * sheet referencing SpaceX and other contractors). These are official
 * administration communications, so they are stored in the `actions` table
 * with `action_type = 'white_house_statement'` — the mention/linking pass then
 * connects each to the companies it names, and they flow into correlations and
 * the graph alongside Federal Register actions.
 *
 * The body text is stored in `summary` so mention detection can scan it: a
 * company is usually named in the body, not the headline.
 */
import { db } from "@/db";
import { actions } from "@/db/schema";
import { sql } from "drizzle-orm";
import { fetchText } from "../lib/http";

const NEWS_INDEXES = [
  "https://www.whitehouse.gov/news/",
  "https://www.whitehouse.gov/fact-sheets/",
  "https://www.whitehouse.gov/briefings-statements/",
  "https://www.whitehouse.gov/articles/",
];

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** Strip a White House article page down to plain text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (!m) return null;
  return htmlToText(m[1]).replace(/\s*[–|]\s*The White House\s*$/i, "").trim();
}

function extractDate(html: string, url: string): string | null {
  const txt = htmlToText(html.slice(0, 6000));
  const m = txt.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (m) {
    return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  }
  // Fallback: /news/<type>/YYYY/MM/slug/ -> first of that month.
  const u = url.match(/\/(\d{4})\/(\d{2})\//);
  return u ? `${u[1]}-${u[2]}-01` : null;
}

/** Classify the White House post by its URL path. */
function categoryOf(url: string): string {
  if (/fact-sheet/i.test(url)) return "white_house_fact_sheet";
  if (/remarks/i.test(url)) return "white_house_remarks";
  if (/briefing/i.test(url)) return "white_house_briefing";
  return "white_house_statement";
}

export interface WhiteHouseResult {
  ingested: number;
  skipped: number;
  errors: string[];
}

export async function ingestWhiteHouse(): Promise<WhiteHouseResult> {
  const result: WhiteHouseResult = { ingested: 0, skipped: 0, errors: [] };

  // Collect candidate article URLs from the news indexes.
  const urls = new Set<string>();
  for (const index of NEWS_INDEXES) {
    try {
      const html = await fetchText(index, { retries: 1, timeoutMs: 25_000 });
      // Article URLs follow /<category>/<YYYY>/<MM>/<slug>/ — match that
      // shape exactly so category landing pages are not mistaken for articles.
      const re =
        /https:\/\/www\.whitehouse\.gov\/(?:fact-sheets|articles|remarks|briefings-statements)\/\d{4}\/\d{2}\/[a-z0-9-]+\//gi;
      for (const m of html.matchAll(re)) urls.add(m[0]);
    } catch (err) {
      result.errors.push(`index ${index}: ${String(err)}`);
    }
  }

  for (const url of urls) {
    try {
      // Presidential actions (EOs/proclamations) come from the Federal
      // Register with cleaner metadata — skip them here to avoid duplicates.
      if (/presidential-actions/i.test(url)) {
        result.skipped++;
        continue;
      }
      const html = await fetchText(url, { retries: 1, timeoutMs: 25_000 });
      const title = extractTitle(html);
      const date = extractDate(html, url);
      const body = htmlToText(html).slice(0, 8000);
      if (!title || !date || body.length < 80) {
        result.skipped++;
        continue;
      }
      const inserted = await db
        .insert(actions)
        .values({
          actionType: categoryOf(url),
          occurredOn: date,
          title,
          summary: body,
          source: "white_house",
          sourceRef: url.replace("https://www.whitehouse.gov", ""),
          sourceUrl: url,
        })
        .onConflictDoNothing({ target: [actions.source, actions.sourceRef] })
        .returning({ id: actions.id });
      if (inserted.length > 0) result.ingested++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(`${url}: ${String(err)}`);
    }
  }

  console.log(
    `[ingest-whitehouse] ${result.ingested} new White House statements, ${result.skipped} skipped`,
  );
  return result;
}

export async function whiteHouseCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(actions)
    .where(sql`${actions.source} = 'white_house'`);
  return Number(row?.n ?? 0);
}
