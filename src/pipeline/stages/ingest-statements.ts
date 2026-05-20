/**
 * Stage 4 — Ingest statements.
 *
 * v1 source: Truth Social posts, polled from the CNN-hosted mirror of the
 * @realDonaldTrump archive (updated every few minutes, no API key). Truth
 * Social posts are single-author and verbatim, so attribution is certain.
 *
 * The govinfo Compilation of Presidential Documents and the American
 * Presidency Project are the authoritative spoken-remarks sources; their
 * clients are added when a `DATA_GOV_API_KEY` is provisioned. This stage is
 * structured so additional sources append statements without schema change.
 */
import { createHash } from "node:crypto";
import { db } from "@/db";
import { statements } from "@/db/schema";
import { sql } from "drizzle-orm";
import { fetchJson } from "../lib/http";
import { ensurePresident } from "../lib/persons";

const TRUTH_FEED = "https://ix.cnn.io/data/truth-social/truth_archive.json";

interface TruthPost {
  id?: string;
  created_at?: string;
  content?: string;
  url?: string;
  text?: string;
}

/** Strip HTML tags and decode the few entities Truth Social emits. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface StatementsResult {
  ingested: number;
  skipped: number;
  errors: string[];
}

/** Ingest Truth Social posts as statements. */
export async function ingestStatements(): Promise<StatementsResult> {
  const result: StatementsResult = { ingested: 0, skipped: 0, errors: [] };
  const personId = await ensurePresident();

  let posts: TruthPost[];
  try {
    const raw = await fetchJson<unknown>(TRUTH_FEED, { timeoutMs: 30_000 });
    posts = Array.isArray(raw) ? (raw as TruthPost[]) : [];
  } catch (err) {
    result.errors.push(`Truth Social feed: ${String(err)}`);
    return result;
  }

  for (const post of posts) {
    try {
      const text = htmlToText(post.content ?? post.text ?? "");
      if (text.length < 4) continue; // image-only / empty re-posts
      const created = post.created_at ? new Date(post.created_at) : null;
      if (!created || Number.isNaN(created.getTime())) continue;

      const contentHash = hash(`truth:${post.id ?? text}`);
      const inserted = await db
        .insert(statements)
        .values({
          personId,
          spokenAt: created.toISOString().slice(0, 10),
          channel: "truth_social",
          venue: "Truth Social",
          fullText: text,
          source: "truth_social",
          sourceUrl: post.url ?? TRUTH_FEED,
          sourceRef: post.id ?? null,
          // A post from the President's own account is verbatim and
          // single-author — attribution is certain.
          attributionMethod: "official_transcript",
          attributionConf: 1,
          contentHash,
        })
        .onConflictDoNothing({ target: statements.contentHash })
        .returning({ id: statements.id });
      if (inserted.length > 0) result.ingested++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(`post ${post.id}: ${String(err)}`);
    }
  }

  console.log(
    `[ingest-statements] ${result.ingested} new Truth Social posts, ${result.skipped} already present`,
  );
  return result;
}

export async function statementCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(statements);
  return Number(row?.n ?? 0);
}
