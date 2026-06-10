import { describe, it, expect } from "vitest";
import { verifySpan } from "./llm-mentions";

const TEXT =
  "Apple will build their next plant in AMERICA. Big announcement coming. Jobs, jobs, jobs!";

describe("verifySpan (FR-S5 — quote spans must be byte-present)", () => {
  it("locates a verbatim quote and returns exact offsets", () => {
    const span = verifySpan(TEXT, "build their next plant in AMERICA");
    expect(span).not.toBeNull();
    expect(TEXT.slice(span!.start, span!.end)).toBe("build their next plant in AMERICA");
  });

  it("rejects paraphrased / hallucinated spans", () => {
    expect(verifySpan(TEXT, "Apple will construct a new plant")).toBeNull();
    expect(verifySpan(TEXT, "build their next plant in America")).toBeNull(); // case differs
  });

  it("rejects trivial spans that could match anywhere", () => {
    expect(verifySpan(TEXT, "a")).toBeNull();
    expect(verifySpan(TEXT, "  ")).toBeNull();
  });

  it("tolerates surrounding whitespace in the model's quote", () => {
    const span = verifySpan(TEXT, "  Big announcement coming.  ");
    expect(span).not.toBeNull();
    expect(TEXT.slice(span!.start, span!.end)).toBe("Big announcement coming.");
  });
});
