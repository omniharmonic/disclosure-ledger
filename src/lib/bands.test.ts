import { describe, it, expect } from "vitest";
import { AMOUNT_BANDS, getBand, bandMidpoint, resolveBand, compactRange } from "./bands";

describe("amount bands", () => {
  it("has 10 contiguous statutory bands", () => {
    expect(AMOUNT_BANDS).toHaveLength(10);
    for (let i = 1; i < AMOUNT_BANDS.length; i++) {
      // each band's min is exactly $1 above the prior band's max
      expect(AMOUNT_BANDS[i].min).toBe((AMOUNT_BANDS[i - 1].max ?? 0) + 1);
    }
  });

  it("band 10 is unbounded", () => {
    expect(getBand(10).max).toBeNull();
  });

  it("rejects invalid band indices", () => {
    expect(() => getBand(0)).toThrow();
    expect(() => getBand(11)).toThrow();
  });

  it("computes midpoints; band 10 floors at its lower bound", () => {
    expect(bandMidpoint(7)).toBe(3_000_001); // ($1,000,001 + $5,000,000)/2 rounded
    expect(bandMidpoint(10)).toBe(50_000_001);
  });

  it("resolves raw 278-T amount strings to band indices", () => {
    expect(resolveBand("$1,000,001 - $5,000,000")).toBe(7);
    expect(resolveBand("$15,001 – $50,000")).toBe(2);
    expect(resolveBand("Over $50,000,000")).toBe(10);
    expect(resolveBand("garbage")).toBeNull();
  });

  it("renders compact ranges", () => {
    expect(compactRange(7)).toContain("M");
    expect(compactRange(10)).toMatch(/^Over/);
  });
});
