import { describe, it, expect } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  // The suite may run in any TZ; CI pins TZ=America/Denver to prove the
  // regression (a date-only string must never render one day early west of
  // UTC — trade dates are the product's core fact).
  it("renders a date-only ISO string as the same calendar day in any timezone", () => {
    expect(formatDate("2026-04-02")).toBe("Apr 2, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDate("2025-12-31")).toBe("Dec 31, 2025");
  });

  it("handles null/undefined/garbage gracefully", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
