/** Presentation helpers shared across the UI. */
import { compactRange, getBand } from "./bands";

/**
 * Format a date-only ISO string without timezone conversion. `new Date("…")`
 * parses date-only strings as UTC midnight, which `toLocaleDateString` then
 * shifts into the viewer's zone — rendering every date one day early for
 * users west of UTC (and mismatching the server-rendered HTML). For a product
 * about trade *dates*, that is a correctness bug, so dates are always
 * formatted in UTC.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Display an amount band as a range — never an implied exact figure. */
export function formatAmount(band: number): string {
  return getBand(band).label;
}

export function formatAmountCompact(band: number): string {
  return compactRange(band);
}

/** Sum of band bounds formatted as a coarse $ figure. */
export function formatDollars(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Tailwind colour token for a transaction type. */
export function typeColor(type: string): string {
  if (type.startsWith("Purchase")) return "text-[var(--color-buy)]";
  if (type.startsWith("Sale")) return "text-[var(--color-sell)]";
  return "text-[var(--color-muted)]";
}

export const TRANSACTION_TYPES = ["Purchase", "Sale", "Sale (Partial)", "Exchange"] as const;
