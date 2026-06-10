import { describe, it, expect } from "vitest";
import {
  WEIGHTS,
  SCORING_VERSION,
  SCORING_CHANGELOG,
  COMPONENT_DEFINITIONS,
  temporalProximity,
  magnitudeScore,
  corroborationScore,
  directionalScore,
  score,
  type ComponentName,
} from "./scoring";

describe("scoring model", () => {
  it("weights sum to 1.0 so the signal is a true 0–100 scale", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("every weighted component has a published definition", () => {
    for (const k of Object.keys(WEIGHTS) as ComponentName[]) {
      expect(COMPONENT_DEFINITIONS[k]).toBeTruthy();
    }
  });

  it("the current version has a changelog entry (methodology is versioned)", () => {
    expect(SCORING_CHANGELOG.some((c) => c.version === SCORING_VERSION)).toBe(true);
  });

  it("temporal proximity decays symmetrically with |gap|", () => {
    expect(temporalProximity(0)).toBe(1);
    expect(temporalProximity(14)).toBeCloseTo(Math.exp(-1), 2);
    expect(temporalProximity(-14)).toBe(temporalProximity(14));
    expect(temporalProximity(45)).toBeLessThan(0.05);
  });

  it("magnitude is monotonic in band and bounded to [0,1]", () => {
    let prev = -1;
    for (let band = 1; band <= 10; band++) {
      const m = magnitudeScore(band);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it("corroboration: single event scores 0, caps at 1", () => {
    expect(corroborationScore(1)).toBe(0);
    expect(corroborationScore(3)).toBe(0.5);
    expect(corroborationScore(99)).toBe(1);
  });

  it("composite score stays in [0,100] and rewards direct same-day events", () => {
    const max = score({
      temporalProximity: 1,
      entitySpecificity: 1,
      authority: 1,
      directionalConsistency: 1,
      tradeMagnitude: 1,
      corroboration: 1,
    });
    expect(max).toBe(100);
    const sectorOnly = score({
      temporalProximity: 1,
      entitySpecificity: 0.6,
      authority: 1,
      directionalConsistency: 0.5,
      tradeMagnitude: 0.5,
      corroboration: 0,
    });
    expect(sectorOnly).toBeLessThan(max);
    expect(sectorOnly).toBeGreaterThan(0);
  });

  it("directional consistency follows the PRD scale (1 aligned / 0.5 unknown / 0 opposite)", () => {
    // favorable words before a purchase align; before a sale they oppose
    expect(directionalScore("Purchase", "statement", "positive", null)).toBe(1);
    expect(directionalScore("Sale", "statement", "positive", null)).toBe(0);
    expect(directionalScore("Sale (Partial)", "statement", "negative", null)).toBe(1);
    expect(directionalScore("Purchase", "statement", "negative", null)).toBe(0);
    // unknown sentiment / undirected events / undirected trades → 0.5
    expect(directionalScore("Purchase", "statement", "neutral", null)).toBe(0.5);
    expect(directionalScore("Purchase", "statement", null, null)).toBe(0.5);
    expect(directionalScore("Exchange", "statement", "positive", null)).toBe(0.5);
    expect(directionalScore("Unknown", "action", null, "contract")).toBe(0.5);
    // a contract award is favorable
    expect(directionalScore("Purchase", "action", null, "contract")).toBe(1);
    expect(directionalScore("Sale", "action", null, "contract")).toBe(0);
    expect(directionalScore("Purchase", "action", null, "executive_order")).toBe(0.5);
  });
});
