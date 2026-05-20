/**
 * OGE statutory disclosure amount bands.
 *
 * Federal financial disclosure never reports an exact dollar figure — only a
 * statutory range. We store the band index (1..10) plus min/max so the UI can
 * always show a *range*, never an implied precise number. Aggregate estimates
 * use band midpoints and must themselves be displayed as ranges.
 */
export interface AmountBand {
  band: number;
  label: string;
  min: number;
  max: number | null; // null = unbounded (band 10, "over $50M")
}

export const AMOUNT_BANDS: readonly AmountBand[] = [
  { band: 1, label: "$1,001 – $15,000", min: 1_001, max: 15_000 },
  { band: 2, label: "$15,001 – $50,000", min: 15_001, max: 50_000 },
  { band: 3, label: "$50,001 – $100,000", min: 50_001, max: 100_000 },
  { band: 4, label: "$100,001 – $250,000", min: 100_001, max: 250_000 },
  { band: 5, label: "$250,001 – $500,000", min: 250_001, max: 500_000 },
  { band: 6, label: "$500,001 – $1,000,000", min: 500_001, max: 1_000_000 },
  { band: 7, label: "$1,000,001 – $5,000,000", min: 1_000_001, max: 5_000_000 },
  { band: 8, label: "$5,000,001 – $25,000,000", min: 5_000_001, max: 25_000_000 },
  { band: 9, label: "$25,000,001 – $50,000,000", min: 25_000_001, max: 50_000_000 },
  { band: 10, label: "Over $50,000,000", min: 50_000_001, max: null },
] as const;

const BY_INDEX = new Map(AMOUNT_BANDS.map((b) => [b.band, b]));

export function getBand(band: number): AmountBand {
  const b = BY_INDEX.get(band);
  if (!b) throw new Error(`Invalid amount band: ${band}`);
  return b;
}

/** Midpoint of a band — used for aggregate estimates only, never per-trade. */
export function bandMidpoint(band: number): number {
  const b = getBand(band);
  // Band 10 is unbounded; use the lower bound as a conservative floor.
  return b.max === null ? b.min : Math.round((b.min + b.max) / 2);
}

/**
 * Resolve a raw "Amount" cell string from a 278-T PDF to a band index.
 * The form prints literal dollar ranges; match defensively on the bounds.
 */
export function resolveBand(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  // Match by the distinctive lower bound of each band.
  for (const b of AMOUNT_BANDS) {
    const minKey = String(b.min);
    if (digits.includes(minKey)) return b.band;
  }
  // "Over $50,000,000" with no recognizable lower bound digits.
  if (/over/i.test(raw) && /50,?000,?000/.test(raw)) return 10;
  return null;
}

/** Compact range label for UI, e.g. "$1M – $5M". */
export function compactRange(band: number): string {
  const b = getBand(band);
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString()}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  };
  return b.max === null ? `Over ${fmt(b.min - 1)}` : `${fmt(b.min - 1)} – ${fmt(b.max)}`;
}
