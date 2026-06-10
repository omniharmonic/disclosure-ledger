/**
 * OGE Domino `?ReadViewEntries` JSON parsing (FR-T1, ARCHITECTURE §3.1).
 *
 * The OGE disclosure site is an HCL Domino application whose views are
 * machine-readable via `?ReadViewEntries&OutputFormat=JSON`. The President
 * himself does not appear in the `PAS+Index` appointee view (he is not
 * Senate-confirmed), so for v1 this poll is a *redundant* discovery channel
 * and the foundation for the Cabinet/appointee expansion (G8) — any entry
 * matching a tracked filer + a 278 form becomes a fetch candidate.
 *
 * The parser is tolerant of Domino's several entrydata value shapes
 * (`text: {0: "…"}`, `text: "…"`, `datetime`, `textlist`).
 */

export interface DominoEntry {
  unid: string;
  /** Flattened text of every entrydata column, in order. */
  columns: string[];
}

interface RawViewEntry {
  "@unid"?: string;
  entrydata?: unknown;
}

function flattenValue(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string" || typeof v === "number") return [String(v)];
  if (Array.isArray(v)) return v.flatMap(flattenValue);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Domino shapes: { text: {0: "…"} } | { text: "…" } | { datetime: {0: "…"} } | { textlist: { text: [...] } }
    const inner = o.text ?? o.datetime ?? o.textlist ?? o.number ?? Object.values(o);
    return flattenValue(inner);
  }
  return [];
}

/** Parse a ReadViewEntries JSON payload into flat entries. */
export function parseDominoEntries(json: unknown): DominoEntry[] {
  if (typeof json !== "object" || json === null) return [];
  const view = (json as Record<string, unknown>).viewentry;
  if (!Array.isArray(view)) return [];
  const out: DominoEntry[] = [];
  for (const raw of view as RawViewEntry[]) {
    const unid = raw["@unid"];
    if (!unid || typeof unid !== "string") continue;
    const cols = Array.isArray(raw.entrydata)
      ? raw.entrydata.flatMap(flattenValue)
      : flattenValue(raw.entrydata);
    out.push({ unid, columns: cols.map((c) => c.trim()).filter(Boolean) });
  }
  return out;
}

export interface OgeFilingCandidate {
  unid: string;
  filerName: string;
  formType: "278-T" | "278e";
  filingDate: string; // ISO
  filename: string | null;
}

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

/**
 * Identify entries that look like a tracked filer's 278 filing. `filerMatch`
 * keeps the filter strict — mislabelling another official's filing as a
 * tracked filer's would corrupt the dataset.
 */
export function ogeCandidatesFrom(
  entries: DominoEntry[],
  filerMatch: RegExp,
): OgeFilingCandidate[] {
  const out: OgeFilingCandidate[] = [];
  for (const e of entries) {
    const joined = e.columns.join(" | ");
    if (!filerMatch.test(joined)) continue;
    if (!/278/.test(joined)) continue;

    const formType: "278-T" | "278e" = /278[\s-]*T/i.test(joined) ? "278-T" : "278e";

    let filingDate: string | null = null;
    const iso = joined.match(ISO_RE);
    const us = joined.match(DATE_RE);
    if (iso) filingDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (us)
      filingDate = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    if (!filingDate || Number.isNaN(Date.parse(filingDate))) continue;

    const filename = e.columns.find((c) => /\.pdf$/i.test(c)) ?? null;
    const filerName =
      e.columns.find((c) => filerMatch.test(c))?.slice(0, 120) ?? "tracked filer";

    out.push({ unid: e.unid, filerName, formType, filingDate, filename });
  }
  return out;
}

/** Build the $FILE PDF URL for a Domino attachment. */
export function ogePdfUrl(unid: string, filename: string): string {
  return `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/${unid}/$FILE/${encodeURIComponent(filename)}`;
}
