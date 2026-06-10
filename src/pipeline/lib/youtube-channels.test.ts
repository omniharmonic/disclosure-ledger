import { describe, it, expect } from "vitest";
import { videoSelectionRule, parseIsoDuration } from "./youtube-channels";
import { normalizeSegments, applySegmentation } from "../stages/ingest-youtube";

describe("video selection heuristics (STATEMENT_INGESTION §3.2)", () => {
  it("tier-A channels are always candidates (unless commentary)", () => {
    expect(videoSelectionRule("Press Briefing", "A", null)).toBeTruthy();
    expect(videoSelectionRule("Trump Speech Analysis and Reaction", "A", null)).toBeNull();
  });

  it("tier-B requires Trump + a speech term in the title", () => {
    expect(
      videoSelectionRule("President Trump delivers remarks on trade", "B", null),
    ).toBeTruthy();
    expect(videoSelectionRule("FULL: Trump press conference at the G7", "B", null)).toBeTruthy();
    expect(videoSelectionRule("Markets rally as Fed holds rates", "B", 600)).toBeNull();
  });

  it("excludes commentary-about-Trump videos", () => {
    expect(videoSelectionRule("Panel reaction to Trump speech", "B", 900)).toBeNull();
    expect(videoSelectionRule("Trump speech highlights and analysis", "B", 900)).toBeNull();
  });

  it("accepts long Trump-titled videos by the duration rule", () => {
    expect(videoSelectionRule("Trump in Michigan", "B", 1800)).toBeTruthy();
    expect(videoSelectionRule("Trump in Michigan", "B", 60)).toBeNull();
  });

  it("parses ISO-8601 durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT3M")).toBe(180);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("garbage")).toBeNull();
  });
});

describe("caption normalization", () => {
  it("accepts the common Supadata-style shapes", () => {
    expect(
      normalizeSegments({ content: [{ text: "hello", offset: 1500 }, { text: "world", offset: 3000 }] }),
    ).toEqual([
      { text: "hello", start: 1500 },
      { text: "world", start: 3000 },
    ]);
    expect(normalizeSegments([{ text: "a", start: 1 }])).toEqual([{ text: "a", start: 1 }]);
    expect(normalizeSegments({ unexpected: true })).toEqual([]);
    expect(normalizeSegments(null)).toEqual([]);
  });
});

describe("speaker segmentation application (FR-S3 gate)", () => {
  const segments = [
    { text: "Mr President what about chips", start: 0 },
    { text: "We are bringing semiconductors home", start: 5 },
    { text: "like nobody has ever seen before", start: 9 },
    { text: "Thank you Mr President", start: 14 },
    { text: "I think tariffs will work", start: 18 },
  ];

  it("keeps only confident TRUMP spans; OTHER/UNCERTAIN never attributed", () => {
    const { trusted, review } = applySegmentation(segments, [
      { index: 0, speaker: "OTHER", confidence: 0.99 },
      { index: 1, speaker: "TRUMP", confidence: 0.95 },
      { index: 2, speaker: "TRUMP", confidence: 0.9 },
      { index: 3, speaker: "OTHER", confidence: 0.95 },
      { index: 4, speaker: "UNCERTAIN", confidence: 0.6 },
    ]);
    expect(trusted).toBe("We are bringing semiconductors home like nobody has ever seen before");
    expect(trusted).not.toContain("Mr President what about");
    expect(trusted).not.toContain("tariffs will work"); // UNCERTAIN excluded entirely
    expect(review).toBe("");
  });

  it("routes low-confidence TRUMP spans to review, never to trusted", () => {
    const { trusted, review, minTrustedConf } = applySegmentation(segments, [
      { index: 1, speaker: "TRUMP", confidence: 0.95 },
      { index: 2, speaker: "TRUMP", confidence: 0.55 },
    ]);
    expect(trusted).toBe("We are bringing semiconductors home");
    expect(review).toBe("like nobody has ever seen before");
    expect(minTrustedConf).toBe(0.95);
  });

  it("unlabeled segments are never attributed", () => {
    const { trusted, review } = applySegmentation(segments, []);
    expect(trusted).toBe("");
    expect(review).toBe("");
  });
});
