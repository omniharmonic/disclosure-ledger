import { describe, it, expect } from "vitest";
import { extractListingLinks, parseAppDocument, parseLongDate } from "./ingest-app";

const LISTING_HTML = `
<div class="view-content">
  <div class="views-row">
    <a href="/documents/remarks-the-american-investment-summit">Remarks at the American Investment Summit</a>
    <span class="date-display-single">April 2, 2026</span>
  </div>
  <div class="views-row">
    <a href="/documents/statement-semiconductor-tariffs-2026">Statement on Semiconductor Tariffs</a>
    <span class="date-display-single">March 30, 2026</span>
  </div>
  <a href="/documents/app-categories/spoken-addresses-and-remarks/presidential">category</a>
</div>`;

const DOC_HTML = `
<html><head><title>Remarks at the American Investment Summit | The American Presidency Project</title></head>
<body>
<div class="field-docs-person"><h3 class="diet-title"><a href="/people/president/donald-j-trump">Donald J. Trump (2nd Term)</a></h3></div>
<span class="date-display-single">April 2, 2026</span>
<div class="field-docs-content"><p>Thank you very much. Today we are announcing the largest
investment in American semiconductor manufacturing in history, and companies like Nvidia
are leading the way back to America. This is a tremendous day for American workers and
for American technology, believe me.</p></div>
</div>
</body></html>`;

describe("APP scraper parsers", () => {
  it("extracts document links and ignores category paths", () => {
    const links = extractListingLinks(LISTING_HTML);
    expect(links).toContain("/documents/remarks-the-american-investment-summit");
    expect(links).toContain("/documents/statement-semiconductor-tariffs-2026");
    expect(links.some((l) => l.includes("app-categories"))).toBe(false);
  });

  it("parses long-form dates", () => {
    expect(parseLongDate("April 2, 2026")).toBe("2026-04-02");
    expect(parseLongDate("posted December 31, 2025 by staff")).toBe("2025-12-31");
    expect(parseLongDate("no date here")).toBeNull();
  });

  it("parses a document page: title, date, speaker, body", () => {
    const doc = parseAppDocument(DOC_HTML);
    expect(doc).not.toBeNull();
    expect(doc!.title).toContain("Remarks at the American Investment Summit");
    expect(doc!.date).toBe("2026-04-02");
    expect(doc!.person).toMatch(/donald j\.? trump/i);
    expect(doc!.body).toContain("semiconductor manufacturing");
    expect(doc!.body).not.toContain("<p>"); // tags stripped
  });

  it("returns null when required fields are missing (defensive against drift)", () => {
    expect(parseAppDocument("<html><body>nothing useful</body></html>")).toBeNull();
    expect(parseAppDocument(DOC_HTML.replace(/April 2, 2026/g, ""))).toBeNull();
  });
});
