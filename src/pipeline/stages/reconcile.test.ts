import { describe, it, expect } from "vitest";
import { recordMatches, type OurRow, type ReconcileRecord } from "./reconcile";

const row: OurRow = {
  id: "t-1",
  date: "2026-04-02",
  ticker: "NVDA",
  description: "NVIDIA CORP, Common Stock",
  amountMin: 1_000_001,
  amountMax: 5_000_000,
};

const rec = (over: Partial<ReconcileRecord>): ReconcileRecord => ({
  source: "propublica",
  date: "2026-04-02",
  ...over,
});

describe("reconcile matcher", () => {
  it("matches on ticker + date + overlapping band", () => {
    expect(
      recordMatches(rec({ ticker: "NVDA", amount_min: 1_000_001, amount_max: 5_000_000 }), row),
    ).toBe(true);
  });

  it("matches on normalized description when ticker is absent", () => {
    expect(recordMatches(rec({ description: "Nvidia Corp" }), row)).toBe(true);
  });

  it("rejects a different date", () => {
    expect(recordMatches(rec({ ticker: "NVDA", date: "2026-04-03" }), row)).toBe(false);
  });

  it("rejects a different security on the same date", () => {
    expect(recordMatches(rec({ ticker: "AAPL" }), row)).toBe(false);
    expect(recordMatches(rec({ description: "Apple Inc" }), row)).toBe(false);
  });

  it("rejects a non-overlapping amount band (a real divergence)", () => {
    expect(
      recordMatches(rec({ ticker: "NVDA", amount_min: 15_001, amount_max: 50_000 }), row),
    ).toBe(false);
  });

  it("accepts unbounded top bands as overlapping", () => {
    const big: OurRow = { ...row, amountMin: 50_000_001, amountMax: null };
    expect(recordMatches(rec({ ticker: "NVDA", amount_min: 50_000_001 }), big)).toBe(true);
  });

  it("requires meaningful description content (no 4-char noise matches)", () => {
    expect(recordMatches(rec({ description: "Inc" }), row)).toBe(false);
  });
});
