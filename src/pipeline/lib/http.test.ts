import { describe, it, expect } from "vitest";
import { redactUrl } from "./http";

describe("redactUrl", () => {
  // Pipeline error strings reach `ingestion_runs` and public CI logs, so any
  // credential-bearing query parameter must be stripped before logging.
  it("redacts known credential query parameters", () => {
    expect(
      redactUrl("https://www.alphavantage.co/query?function=W&symbol=NVDA&apikey=SECRET123"),
    ).toBe("https://www.alphavantage.co/query?function=W&symbol=NVDA&apikey=***");
    expect(redactUrl("https://finnhub.io/api/v1/quote?symbol=NVDA&token=sk_live_abc")).toBe(
      "https://finnhub.io/api/v1/quote?symbol=NVDA&token=***",
    );
    expect(redactUrl("https://api.govinfo.gov/collections/CPD?api_key=K&offset=0")).toBe(
      "https://api.govinfo.gov/collections/CPD?api_key=***&offset=0",
    );
  });

  it("redacts inside composed error messages", () => {
    const msg = "HTTP 429 from https://x.test/q?apikey=LEAKME and more";
    expect(redactUrl(msg)).not.toContain("LEAKME");
  });

  it("leaves credential-free URLs untouched", () => {
    const url = "https://www.federalregister.gov/api/v1/documents.json?per_page=100";
    expect(redactUrl(url)).toBe(url);
  });
});
