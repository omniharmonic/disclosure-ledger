/**
 * Curated seed list of known President filings.
 *
 * The President is not Senate-confirmed and therefore does not appear in the
 * OGE `PAS+Index` categorized view used for appointees. Discovery of his
 * filings therefore relies on (a) this curated seed list of known documents,
 * (b) the White House uploads monitor, and (c) OGE UNID-neighbour probing.
 * Each new filing, once verified, is appended here so the seed list is the
 * durable record of what has been discovered.
 */
export interface FilingSeed {
  filerName: string;
  formType: "278-T" | "278e";
  filingDate: string; // ISO date the filing was published/submitted
  sourceUrl: string;
  ogeUnid?: string;
  label: string;
}

const OGE = "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index";

function ogeUrl(unid: string, encodedFilename: string): string {
  return `${OGE}/${unid}/$FILE/${encodedFilename}`;
}

export const PRESIDENT_FILING_SEEDS: readonly FilingSeed[] = [
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2026-05-08",
    ogeUnid: "5326D3AF5BE7C25385258DF7002DD1B7",
    sourceUrl: ogeUrl(
      "5326D3AF5BE7C25385258DF7002DD1B7",
      "Trump,%20Donald%20J.-05.08.2026-278T.pdf",
    ),
    label: "May 8, 2026 — 278-T (Part 1)",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2026-05-08",
    ogeUnid: "405E4EC4E27BE8D185258DF7002DD1C0",
    sourceUrl: ogeUrl(
      "405E4EC4E27BE8D185258DF7002DD1C0",
      "Trump,%20Donald%20J.-05.08.2026-278T(2).pdf",
    ),
    label: "May 8, 2026 — 278-T (Part 2)",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2026-01-14",
    ogeUnid: "268353939B7DACB585258D81003471B1",
    sourceUrl: ogeUrl(
      "268353939B7DACB585258D81003471B1",
      "Donald-J-Trump%201.14.2026-278T.pdf",
    ),
    label: "January 14, 2026 — 278-T",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2025-11-14",
    ogeUnid: "903A217DC18563EC85258D4A0031B044",
    sourceUrl: ogeUrl(
      "903A217DC18563EC85258D4A0031B044",
      "Donald%20J.%20Trump%2011.14.2025%20278-T.pdf",
    ),
    label: "November 14, 2025 — 278-T",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2025-10-20",
    ogeUnid: "18353894FE440B3685258D430031A337",
    sourceUrl: ogeUrl(
      "18353894FE440B3685258D430031A337",
      "Donald%20J.%20Trump%2010.20.2025%20278-T%20(2).pdf",
    ),
    label: "October 20, 2025 — 278-T (Part 2)",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2025-10-17",
    ogeUnid: "AA799A2729B4D1BE85258D430031A320",
    sourceUrl: ogeUrl(
      "AA799A2729B4D1BE85258D430031A320",
      "Donald%20J.%20Trump%2010.17.2025%20278-T.pdf",
    ),
    label: "October 17, 2025 — 278-T",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278e",
    filingDate: "2025-06-13",
    ogeUnid: "4EC9A8E6DD078F2985258CA9002C9377",
    sourceUrl: ogeUrl(
      "4EC9A8E6DD078F2985258CA9002C9377",
      "Trump,%20Donald%20J.%202025%20Annual%20278.pdf",
    ),
    label: "2025 Annual — 278e",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2026-02-26",
    sourceUrl:
      "https://www.whitehouse.gov/wp-content/uploads/2026/03/President-Donald-J.-Trump-Periodic-Transaction-Report-2.26.26-1.pdf",
    label: "February 26, 2026 — 278-T (White House copy)",
  },
  {
    filerName: "Donald J. Trump",
    formType: "278-T",
    filingDate: "2026-04-20",
    sourceUrl:
      "https://www.whitehouse.gov/wp-content/uploads/2026/04/President-Donald-J.-Trump-Periodic-Transaction-Report-4.20.26.pdf",
    label: "April 20, 2026 — 278-T (White House copy)",
  },
] as const;
