import { describe, it, expect } from "vitest";
import {
  isSingleSpeakerTitle,
  textSimilarity,
  statementsLikelySame,
} from "./statement-filters";

describe("speaker-safety classification (FR-S3)", () => {
  it("accepts single-speaker document titles", () => {
    expect(isSingleSpeakerTitle("Remarks at the National Prayer Breakfast")).toBe(true);
    expect(isSingleSpeakerTitle("Address to the Nation on Trade Policy")).toBe(true);
    expect(isSingleSpeakerTitle("Statement on Semiconductor Manufacturing")).toBe(true);
    expect(isSingleSpeakerTitle("Message to the Congress on Tariffs")).toBe(true);
  });

  it("defers every multi-speaker category to the segmentation layer", () => {
    expect(isSingleSpeakerTitle("The President's News Conference")).toBe(false);
    expect(isSingleSpeakerTitle("Interview With Fox News")).toBe(false);
    expect(isSingleSpeakerTitle("Remarks and an Exchange With Reporters")).toBe(false);
    expect(isSingleSpeakerTitle("Remarks in a Question-and-Answer Session")).toBe(false);
    expect(isSingleSpeakerTitle("Press Gaggle Aboard Air Force One")).toBe(false);
  });
});

const SPEECH_A =
  "Thank you very much everyone. Today we are announcing the largest investment in " +
  "American semiconductor manufacturing in history. Companies are coming back to " +
  "America because of our policies and our tariffs and our incredible workers.";
const SPEECH_A_CPD =
  "Thank you very much, everyone. Today, we are announcing the largest investment in " +
  "American semiconductor manufacturing in history. Companies are coming back to " +
  "America because of our policies, and our tariffs, and our incredible workers.";
const SPEECH_B =
  "We are gathered here to honor the brave men and women of law enforcement who put " +
  "their lives on the line every single day to keep our communities safe and strong.";

describe("statement similarity (FR-S6)", () => {
  it("near-identical text (punctuation/edit drift) scores high", () => {
    expect(textSimilarity(SPEECH_A, SPEECH_A_CPD)).toBeGreaterThan(0.8);
  });

  it("different speeches score low", () => {
    expect(textSimilarity(SPEECH_A, SPEECH_B)).toBeLessThan(0.2);
  });

  it("matches the same event across sources on the same day", () => {
    expect(
      statementsLikelySame(
        { spokenAt: "2026-04-02", fullText: SPEECH_A_CPD, venue: "Remarks on Semiconductor Investment" },
        { spokenAt: "2026-04-02", fullText: SPEECH_A, venue: "Remarks on Semiconductor Investments" },
      ),
    ).toBe(true);
  });

  it("never matches across different days (precision bias)", () => {
    expect(
      statementsLikelySame(
        { spokenAt: "2026-04-02", fullText: SPEECH_A },
        { spokenAt: "2026-04-03", fullText: SPEECH_A },
      ),
    ).toBe(false);
  });

  it("never matches different events on the same day", () => {
    expect(
      statementsLikelySame(
        { spokenAt: "2026-04-02", fullText: SPEECH_A, venue: "Remarks on Semiconductors" },
        { spokenAt: "2026-04-02", fullText: SPEECH_B, venue: "Remarks at the Police Memorial" },
      ),
    ).toBe(false);
  });
});
