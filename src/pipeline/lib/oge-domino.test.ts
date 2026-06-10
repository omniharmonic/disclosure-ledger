import { describe, it, expect } from "vitest";
import { parseDominoEntries, ogeCandidatesFrom, ogePdfUrl } from "./oge-domino";

/** Shaped like a real `?ReadViewEntries&OutputFormat=JSON` payload. */
const DOMINO_JSON = {
  "@toplevelentries": "4",
  viewentry: [
    {
      "@unid": "5326D3AF5BE7C25385258DF7002DD1B7",
      entrydata: [
        { "@name": "filer", text: { 0: "Trump, Donald J." } },
        { "@name": "form", text: { 0: "278-T" } },
        { "@name": "date", datetime: { 0: "2026-05-08" } },
        { "@name": "file", text: { 0: "Trump, Donald J.-05.08.2026-278T.pdf" } },
      ],
    },
    {
      "@unid": "AA0000000000000000000000000000A1",
      entrydata: [
        { "@name": "filer", text: "Doe, Jane" }, // bare-string text shape
        { "@name": "form", text: { 0: "278e Annual" } },
        { "@name": "date", text: { 0: "6/13/2025" } },
        { "@name": "file", text: { 0: "Doe, Jane 2025 Annual 278.pdf" } },
      ],
    },
    {
      "@unid": "BB0000000000000000000000000000B2",
      entrydata: [
        { "@name": "filer", textlist: { text: [{ 0: "Trump, Donald J." }] } },
        { "@name": "form", text: { 0: "278e" } },
        { "@name": "date", text: { 0: "6/13/2025" } },
        // no attachment column
      ],
    },
    { entrydata: [] }, // no @unid — dropped
  ],
};

describe("Domino ReadViewEntries parsing (FR-T1)", () => {
  it("flattens every entrydata value shape", () => {
    const entries = parseDominoEntries(DOMINO_JSON);
    expect(entries).toHaveLength(3);
    expect(entries[0].columns).toContain("Trump, Donald J.");
    expect(entries[1].columns).toContain("Doe, Jane");
    expect(entries[2].columns).toContain("Trump, Donald J."); // textlist shape
  });

  it("tolerates garbage payloads", () => {
    expect(parseDominoEntries(null)).toEqual([]);
    expect(parseDominoEntries({ viewentry: "nope" })).toEqual([]);
    expect(parseDominoEntries("html error page")).toEqual([]);
  });

  it("filters candidates strictly to the tracked filer + 278 forms", () => {
    const entries = parseDominoEntries(DOMINO_JSON);
    const cands = ogeCandidatesFrom(entries, /trump,?\s+donald/i);
    // Jane Doe excluded; the Trump 278e without an attachment still parses
    // (the discover stage drops attachment-less ones).
    expect(cands).toHaveLength(2);
    expect(cands[0]).toMatchObject({
      unid: "5326D3AF5BE7C25385258DF7002DD1B7",
      formType: "278-T",
      filingDate: "2026-05-08",
      filename: "Trump, Donald J.-05.08.2026-278T.pdf",
    });
    expect(cands[1].formType).toBe("278e");
    expect(cands[1].filingDate).toBe("2025-06-13"); // US-format date normalized
    expect(cands[1].filename).toBeNull();
  });

  it("builds the $FILE attachment URL", () => {
    expect(ogePdfUrl("ABC123", "Trump, Donald J.-05.08.2026-278T.pdf")).toBe(
      "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/ABC123/$FILE/Trump%2C%20Donald%20J.-05.08.2026-278T.pdf",
    );
  });
});
