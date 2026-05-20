/** Presentation helpers shared across the UI. */
import { compactRange, getBand } from "./bands";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
