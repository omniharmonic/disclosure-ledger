"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TimelineEvent } from "@/lib/queries";
import { formatDate } from "@/lib/format";

const LANES = [
  { kind: "trade", label: "Trades", color: "#8a1a1a" },
  { kind: "statement", label: "Statements", color: "#1f6f43" },
  { kind: "action", label: "Official actions", color: "#9a6b00" },
] as const;

const DAY = 86_400_000;
const PX_PER_DAY = 7;

/** A wide, horizontally-scrollable three-lane timeline. Click a marker to pin it. */
export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const [pinned, setPinned] = useState<TimelineEvent | null>(null);

  const { shown, min, width, months } = useMemo(() => {
    const tradeTimes = events
      .filter((e) => e.kind === "trade")
      .map((e) => Date.parse(e.date))
      .filter((t) => !Number.isNaN(t));
    const lo0 = tradeTimes.length ? Math.min(...tradeTimes) : Date.now() - 200 * DAY;
    const hi0 = tradeTimes.length ? Math.max(...tradeTimes) : Date.now();
    // Focus the window on the trade period (statements span years otherwise).
    const lo = lo0 - 60 * DAY;
    const hi = hi0 + 30 * DAY;

    const inWindow = events.filter((e) => {
      const t = Date.parse(e.date);
      return !Number.isNaN(t) && t >= lo && t <= hi;
    });

    const days = Math.max(1, (hi - lo) / DAY);
    const w = Math.min(4200, Math.max(1100, days * PX_PER_DAY));

    const m: { label: string; pct: number }[] = [];
    const d = new Date(lo);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= hi) {
      m.push({
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        pct: ((d.getTime() - lo) / (hi - lo)) * 100,
      });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return { shown: inWindow, min: lo, width: w, months: m };
  }, [events]);

  const span = useMemo(() => {
    const times = shown.map((e) => Date.parse(e.date));
    return Math.max(1, Math.max(...times, min) - min);
  }, [shown, min]);

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-rule)] p-8 text-center text-sm text-[var(--color-muted)]">
        No dated events yet.
      </p>
    );
  }

  const xOf = (date: string) => ((Date.parse(date) - min) / span) * 100;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)]">
        <div className="relative" style={{ width, height: 248 }}>
          {months.map((m) => (
            <div
              key={m.label + m.pct}
              className="absolute top-0 bottom-8 border-l border-[var(--color-rule-soft)]"
              style={{ left: `${m.pct}%` }}
            >
              <span className="ml-1.5 font-mono text-[0.65rem] text-[var(--color-muted)]">
                {m.label}
              </span>
            </div>
          ))}
          {LANES.map((lane, i) => (
            <div key={lane.kind} className="absolute right-0 left-0" style={{ top: 30 + i * 64 }}>
              <div
                className="mb-1 ml-1 font-mono text-[0.65rem] font-semibold uppercase tracking-wide"
                style={{ color: lane.color }}
              >
                {lane.label}
              </div>
              <div className="relative h-9 rounded bg-[var(--color-paper)]">
                {shown
                  .filter((e) => e.kind === lane.kind)
                  .map((e) => {
                    const active = pinned?.id === e.id;
                    return (
                      <button
                        key={e.id}
                        className="absolute top-1.5 h-6 -translate-x-1/2 rounded-full transition-all hover:h-7 hover:top-1"
                        style={{
                          left: `${xOf(e.date)}%`,
                          width: active ? 7 : 4,
                          background: lane.color,
                          opacity: active ? 1 : 0.62,
                          outline: active ? "2px solid var(--color-ink)" : "none",
                        }}
                        onClick={() => setPinned(e)}
                        aria-label={`${e.kind} ${e.date}: ${e.label}`}
                      />
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[6rem] rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4">
        {pinned ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-white"
                style={{
                  background:
                    LANES.find((l) => l.kind === pinned.kind)?.color ?? "var(--color-muted)",
                }}
              >
                {pinned.kind}
              </span>
              <span className="kicker">{formatDate(pinned.date)}</span>
              {pinned.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/companies/${encodeURIComponent(tag)}`}
                  className="rounded border border-[var(--color-rule)] px-1.5 py-0.5 font-mono text-[0.65rem] hover:border-[var(--color-accent)]"
                >
                  ${tag}
                </Link>
              ))}
            </div>
            <p className="mt-2 font-display text-base leading-snug">{pinned.detail}</p>
            <div className="mt-2 text-xs">
              {pinned.internal ? (
                <Link href={pinned.href} className="font-medium text-[var(--color-accent)] hover:underline">
                  Open trade detail →
                </Link>
              ) : (
                <a href={pinned.href} target="_blank" rel="noopener noreferrer"
                   className="font-medium text-[var(--color-accent)] hover:underline">
                  primary source ↗
                </a>
              )}
            </div>
            {pinned.related.length > 0 && (
              <div className="mt-3 border-t border-[var(--color-rule-soft)] pt-2">
                <div className="kicker mb-1.5">
                  Correlated with · {pinned.related.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pinned.related.map((r, i) => (
                    <Link
                      key={i}
                      href={r.href}
                      className="flex items-center gap-1.5 rounded border border-[var(--color-rule-soft)] px-2 py-1 text-[0.7rem] hover:border-[var(--color-accent)]"
                    >
                      <span
                        className="font-mono font-bold"
                        style={{
                          color:
                            r.signal >= 60
                              ? "var(--color-accent)"
                              : r.signal >= 40
                                ? "var(--color-flag)"
                                : "var(--color-muted)",
                        }}
                      >
                        {r.signal.toFixed(0)}
                      </span>
                      <span className="max-w-[18rem] truncate">{r.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Click any marker to read it and see what it&rsquo;s correlated with. Scroll the
            timeline horizontally to move through time — {shown.length} events shown.
          </p>
        )}
      </div>
    </div>
  );
}
