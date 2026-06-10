/**
 * Precision tests for the company gazetteer — the product's misattribution
 * firewall. A false "the President mentioned X" is the highest-severity
 * defect class (PRD NFR "Attribution integrity"), so the guards here are
 * locked in by test: weak solo tokens, generic name words, ticker stopwords,
 * cashtag-only ticker matching, and byte-verified spans (FR-S5).
 */
import { describe, it, expect } from "vitest";
import { companyMatchKey, findSpans, findTopicSpans, type Gaz } from "./detect-mentions";

const gaz = (over: Partial<Gaz>): Gaz => ({
  companyId: "c-1",
  ticker: null,
  nameKey: null,
  displayName: "",
  ...over,
});

describe("companyMatchKey", () => {
  it("derives a distinctive single token for one-word names", () => {
    expect(companyMatchKey("Datadog Inc")).toBe("datadog");
    expect(companyMatchKey("NVIDIA CORP")).toBe("nvidia");
  });

  it("uses a two-word phrase for multi-word names", () => {
    expect(companyMatchKey("State Street Corporation")).toBe("state street");
    expect(companyMatchKey("Lam Research Corp")).toBeNull(); // "lam" too short, "research" weak
  });

  it("rejects names that reduce to generic/weak tokens", () => {
    expect(companyMatchKey("Southern Co")).toBeNull();
    expect(companyMatchKey("Carrier Global Corp")).toBeNull();
    expect(companyMatchKey("Target Corp")).toBeNull();
  });
});

describe("findSpans — company mentions", () => {
  it("matches a distinctive company name token", () => {
    const spans = findSpans("I spoke with Nvidia about chips.", gaz({ nameKey: "nvidia" }));
    expect(spans).toHaveLength(1);
    expect(spans[0].quote).toContain("Nvidia");
  });

  it("matches tickers ONLY as cashtags", () => {
    expect(findSpans("Buy $NVDA now", gaz({ ticker: "NVDA" }))).toHaveLength(1);
    expect(findSpans("NVDA is mentioned bare", gaz({ ticker: "NVDA" }))).toHaveLength(0);
  });

  it("does not match ticker stopwords even as cashtags would collide", () => {
    expect(findSpans("we will WIN and ALL will see", gaz({ ticker: "ALL" }))).toHaveLength(0);
    expect(findSpans("USA! USA!", gaz({ ticker: "USA" }))).toHaveLength(0);
  });

  it("matches multi-word phrases adjacently, not across unrelated words", () => {
    const g = gaz({ nameKey: "state street" });
    expect(findSpans("the State Street building", g)).toHaveLength(1);
    expect(findSpans("the State Senate met on Main Street", g)).toHaveLength(0);
  });

  it("'the southern border' never matches Southern Co (the canonical trap)", () => {
    // companyMatchKey("Southern Co") is null and "SO" is 2 chars + stopword-adjacent;
    // with no usable key, no spans can be produced.
    const key = companyMatchKey("Southern Co");
    expect(key).toBeNull();
    expect(
      findSpans("The southern border is the most secure in history.", gaz({ nameKey: key })),
    ).toHaveLength(0);
  });

  it("spans are byte-verified against the source text (FR-S5)", () => {
    const text = "Apple will build in AMERICA.";
    const [span] = findSpans(text, gaz({ nameKey: "apple" }));
    expect(text.slice(span.start, span.end).toLowerCase()).toBe("apple");
  });
});

describe("findTopicSpans", () => {
  it("locates topic phrases with verified offsets", () => {
    const text = "We are putting big tariffs on semiconductors next week.";
    const spans = findTopicSpans(text, /\bsemiconductors?\b/i);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("semiconductors");
  });

  it("returns nothing when the phrase is absent", () => {
    expect(findTopicSpans("nothing relevant here", /\bsemiconductors?\b/i)).toHaveLength(0);
  });
});
