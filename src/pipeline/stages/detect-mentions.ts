/**
 * Mention detection.
 *
 * Scans statements (and official-action text) for references to companies in
 * the resolved universe. v1 uses a precise gazetteer pass — ticker symbols and
 * distinctive company-name tokens — recording the exact verbatim quote span
 * and its character offsets. Every stored span is verified to be byte-present
 * in the source text (PRD FR-S5); a span that cannot be located is dropped.
 *
 * The LLM extraction layer (sentiment, stance, fuzzy references) augments this
 * when an Anthropic key is configured; the gazetteer pass always runs.
 */
import { db } from "@/db";
import { companies, statements, statementMentions, actions, actionTargets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Generic words that recur in company names but carry no identifying weight —
 * matching a statement on one of these produces false positives ("American",
 * "Energy"). A bare-token mention must use a token outside this set.
 */
const GENERIC_NAME_WORDS = new Set([
  "the", "and", "inc", "corp", "corporation", "company", "group", "holdings",
  "international", "global", "technologies", "technology", "systems", "services",
  "industries", "enterprises", "solutions", "resources", "properties", "brands",
  "communications", "media", "health", "healthcare", "bank", "bancorp", "trust",
  "fund", "financial", "finance", "capital", "partners", "american", "america",
  "national", "united", "general", "first", "energy", "power", "electric", "water",
  "gas", "oil", "natural", "products", "materials", "industrial", "consumer",
  "digital", "data", "cloud", "software", "systems", "network", "networks", "world",
  "states", "new", "south", "north", "east", "west", "central", "great", "home",
  "city", "county", "real", "estate", "insurance", "life", "auto", "motors", "air",
  "lines", "airlines", "stores", "retail", "food", "foods", "beverage", "metals",
  "mining", "gold", "silver", "steel", "pharmaceuticals", "pharma", "bio", "science",
  "sciences", "medical", "devices", "entertainment", "studios", "hotels", "resorts",
]);

/** Common English words / abbreviations that collide with short tickers. */
const TICKER_STOPWORDS = new Set([
  "A", "I", "IT", "ON", "OR", "SO", "BE", "GO", "AT", "ALL", "ANY", "ARE", "CEO",
  "DD", "ET", "FOR", "GOOD", "HAS", "KEY", "LOW", "NOW", "ONE", "OUT", "PLAN", "SEE",
  "TRUE", "TWO", "USA", "WELL", "BIG", "CAR", "GAS", "NEW", "OLD", "RUN", "WIN", "WE",
  "AN", "AM", "PM", "US", "UK", "EU", "DOW", "FOX", "ICE", "JOB", "LOVE", "PAY", "TV",
]);

interface Gaz {
  companyId: string;
  ticker: string | null;
  /**
   * Lower-cased match key. A single distinctive token ("datadog") for
   * one-word company names, or a two-word phrase ("state street") for
   * multi-word names — so "State Street" cannot false-match "State Senate".
   */
  nameKey: string | null;
  displayName: string;
}

/**
 * Single tokens too generic to identify a company on their own. A one-word
 * match key must be outside this set; multi-word names are matched as a phrase
 * regardless, so "State Street" -> "state street" cannot hit "State Senate".
 */
const WEAK_SOLO_TOKENS = new Set([
  "state", "states", "street", "world", "people", "value", "trust", "point",
  "river", "creek", "ridge", "field", "stone", "white", "black", "green",
  "north", "south", "prime", "union", "grand", "royal", "crown", "eagle",
  "liberty", "summit", "vista", "metro", "civic", "public", "patriot",
  // geographic / generic adjectives that recur in company names but match
  // unrelated political language ("Southern Co" vs. "southern border").
  "southern", "northern", "eastern", "western", "central", "american",
  "america", "national", "general", "pacific", "atlantic", "commerce",
  "citizens", "citizen", "capital", "frontier", "heritage", "mountain",
  "valley", "harbor", "global", "united", "first", "premier", "paramount",
  "sterling", "freedom", "victory", "alliance", "horizon", "legacy", "future",
  "vision", "pioneer", "century", "standard", "republic", "independence",
  "select", "premium", "advance", "advanced", "enterprise", "service",
  "country", "border", "energy", "power", "digital", "global", "national",
  // industry / business common nouns — a lone one of these identifies no
  // specific company ("Lam Research" must not match "research and engineering").
  "research", "technologies", "technology", "industries", "industrial",
  "defense", "engineering", "motors", "financial", "partners", "ventures",
  "brands", "foods", "restaurant", "restaurants", "software", "semiconductor",
  "pharmaceutical", "pharmaceuticals", "biosciences", "therapeutics",
  "networks", "communications", "entertainment", "resources", "minerals",
  "petroleum", "airlines", "airways", "hotels", "properties", "realty",
  "insurance", "securities", "payments", "solutions", "services", "products",
  "systems", "devices", "instruments", "laboratories", "materials",
  "chemicals", "automotive", "transport", "transportation", "logistics",
  "development", "management", "consulting", "diagnostics", "biotech",
  "exploration", "operating", "international", "associates", "holding",
]);

/**
 * Build a precise match key from a company name. Generic business words are
 * stripped; a single remaining distinctive word (>= 5 chars, not a weak solo
 * token) is matched alone; two or more remaining words must match as an
 * adjacent phrase.
 */
function companyMatchKey(name: string): string | null {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
  if (words.length === 0) return null;
  if (words.length === 1) {
    return words[0].length >= 5 && !WEAK_SOLO_TOKENS.has(words[0]) ? words[0] : null;
  }
  return `${words[0]} ${words[1]}`;
}

async function buildGazetteer(): Promise<Gaz[]> {
  const rows = await db
    .select({ id: companies.id, name: companies.name, ticker: companies.ticker })
    .from(companies);
  return rows.map((r) => ({
    companyId: r.id,
    ticker: r.ticker,
    nameKey: companyMatchKey(r.name),
    displayName: r.name,
  }));
}

/** Find verified mention spans of a company within `text`. */
function findSpans(text: string, g: Gaz): { quote: string; start: number; end: number }[] {
  const hits: { quote: string; start: number; end: number }[] = [];
  const patterns: RegExp[] = [];
  // Tickers are matched case-sensitively (uppercase) and only at length >= 3,
  // to avoid two-letter symbols colliding with ordinary words.
  if (g.ticker && g.ticker.length >= 3 && !TICKER_STOPWORDS.has(g.ticker.toUpperCase())) {
    patterns.push(new RegExp(`\\b${g.ticker}\\b`, "g"));
  }
  if (g.nameKey) {
    // Single token, or a two-word phrase with flexible whitespace.
    const pat = g.nameKey.includes(" ")
      ? g.nameKey.split(" ").join("\\s+")
      : g.nameKey;
    patterns.push(new RegExp(`\\b${pat}\\b`, "gi"));
  }
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const qStart = Math.max(0, start - 80);
      const qEnd = Math.min(text.length, end + 80);
      const quote = text.slice(qStart, qEnd).trim();
      // Verify the span is genuinely present (PRD FR-S5).
      if (text.slice(start, end) === m[0]) {
        hits.push({ quote, start, end });
      }
    }
  }
  return hits;
}

export interface MentionResult {
  statementMentions: number;
  actionTargets: number;
}

/** Detect company mentions across statements and official actions. */
export async function detectMentions(): Promise<MentionResult> {
  const gaz = await buildGazetteer();
  const result: MentionResult = { statementMentions: 0, actionTargets: 0 };
  if (gaz.length === 0) {
    console.log("[detect-mentions] no companies in the universe yet — nothing to match");
    return result;
  }

  // --- statements ----------------------------------------------------------
  const stmts = await db
    .select({ id: statements.id, text: statements.fullText })
    .from(statements);
  for (const s of stmts) {
    await db.delete(statementMentions).where(eq(statementMentions.statementId, s.id));
    const seen = new Set<string>();
    for (const g of gaz) {
      for (const span of findSpans(s.text, g)) {
        const key = `${g.companyId}:${span.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await db.insert(statementMentions).values({
          statementId: s.id,
          companyId: g.companyId,
          exactQuote: span.quote,
          charStart: span.start,
          charEnd: span.end,
          confidence: 0.6,
          method: "gazetteer",
        });
        result.statementMentions++;
      }
    }
  }

  // --- official actions ----------------------------------------------------
  const acts = await db
    .select({ id: actions.id, title: actions.title, summary: actions.summary })
    .from(actions);
  for (const a of acts) {
    await db.delete(actionTargets).where(eq(actionTargets.actionId, a.id));
    const text = `${a.title}\n${a.summary ?? ""}`;
    const seen = new Set<string>();
    for (const g of gaz) {
      if (seen.has(g.companyId)) continue;
      if (findSpans(text, g).length > 0) {
        seen.add(g.companyId);
        await db.insert(actionTargets).values({
          actionId: a.id,
          companyId: g.companyId,
          linkMethod: "named",
          confidence: 0.6,
        });
        result.actionTargets++;
      }
    }
  }

  console.log(
    `[detect-mentions] ${result.statementMentions} statement mentions, ` +
      `${result.actionTargets} action→company links`,
  );
  return result;
}

export async function mentionCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(statementMentions);
  return Number(row?.n ?? 0);
}
