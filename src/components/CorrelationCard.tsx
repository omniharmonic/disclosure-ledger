import Link from "next/link";
import { formatDate } from "@/lib/format";

export interface CorrelationCardData {
  eventKind: "statement" | "action";
  daysGap: number;
  signalScore: number;
  components: Record<string, number>;
  eventDate: string;
  eventTitle: string;
  eventUrl: string;
  /** Optional — shown when the card appears outside a single-trade context. */
  transactionId?: string;
  transactionType?: string;
  transactionDate?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  temporalProximity: "Temporal proximity",
  entitySpecificity: "Entity specificity",
  authority: "Authority",
  directionalConsistency: "Directional consistency",
  tradeMagnitude: "Trade magnitude",
  corroboration: "Corroboration",
};

function signalColor(s: number): string {
  if (s >= 60) return "var(--color-accent)";
  if (s >= 40) return "var(--color-flag)";
  return "var(--color-muted)";
}

function gapPhrase(days: number): string {
  if (days === 0) return "same day as the trade";
  return days > 0 ? `${days} days after the trade` : `${-days} days before the trade`;
}

/** One scored trade ↔ event correlation, written out in full. */
export function CorrelationCard({ c }: { c: CorrelationCardData }) {
  return (
    <article className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="kicker">
            {c.eventKind === "statement" ? "Public statement" : "Official action"}
            {" · "}
            {gapPhrase(c.daysGap)}
          </div>
          {c.transactionType && c.transactionDate && (
            <div className="mt-0.5 text-xs text-[var(--color-muted)]">
              paired with {c.transactionType} on {formatDate(c.transactionDate)}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className="font-display text-3xl font-semibold leading-none"
            style={{ color: signalColor(c.signalScore) }}
          >
            {c.signalScore.toFixed(0)}
          </div>
          <div className="kicker">signal / 100</div>
        </div>
      </div>

      <p className="mt-3 font-display text-[1.05rem] leading-snug break-words [overflow-wrap:anywhere]">
        &ldquo;{c.eventTitle}
        {c.eventTitle.length >= 270 ? "…" : ""}&rdquo;
      </p>

      {/* component breakdown — the score is fully auditable */}
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-3">
        {Object.entries(c.components).map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-[0.7rem]">
              <span className="text-[var(--color-muted)]">{COMPONENT_LABELS[k] ?? k}</span>
              <span className="tabular">{typeof v === "number" ? v.toFixed(2) : v}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-[var(--color-rule-soft)]">
              <div
                className="h-1 rounded-full bg-[var(--color-ink-soft)]"
                style={{ width: `${Math.min(100, (Number(v) || 0) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-[var(--color-rule-soft)] pt-2.5 text-xs">
        <span className="text-[var(--color-muted)]">{formatDate(c.eventDate)}</span>
        <a
          href={c.eventUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--color-accent)] hover:underline"
        >
          primary source ↗
        </a>
        {c.transactionId && (
          <Link
            href={`/trades/${c.transactionId}`}
            className="text-[var(--color-ink-soft)] hover:underline"
          >
            view trade →
          </Link>
        )}
      </div>
    </article>
  );
}
