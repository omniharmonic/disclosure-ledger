"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TimelineEvent } from "@/lib/queries";

const LANES = [
  { kind: "trade", label: "Trades", color: "#8a1a1a" },
  { kind: "statement", label: "Statements", color: "#1f6f43" },
  { kind: "action", label: "Official actions", color: "#b8860b" },
] as const;

const hrefFor = (e: TimelineEvent) => (e.kind === "trade" ? `/trades/${e.id}` : null);

/** A three-lane interactive timeline of trades, statements, and actions. */
export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const [hover, setHover] = useState<TimelineEvent | null>(null);

  const { min, span, months } = useMemo(() => {
    const times = events.map((e) => Date.parse(e.date)).filter((t) => !Number.isNaN(t));
    const lo = Math.min(...times);
    const hi = Math.max(...times);
    const s = Math.max(1, hi - lo);
    const m: { label: string; pct: number }[] = [];
    const d = new Date(lo);
    d.setUTCDate(1);
    while (d.getTime() <= hi) {
      m.push({
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        pct: ((d.getTime() - lo) / s) * 100,
      });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return { min: lo, span: s, months: m };
  }, [events]);

  if (events.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-rule)] p-8 text-center text-sm text-[var(--color-muted)]">
        No dated events yet.
      </p>
    );
  }

  const xOf = (date: string) => ((Date.parse(date) - min) / span) * 100;

  return (
    <div className="rounded border border-[var(--color-rule)] bg-white p-4">
      <div className="relative" style={{ minHeight: 220 }}>
        {/* month gridlines */}
        {months.map((m) => (
          <div
            key={m.label + m.pct}
            className="absolute top-0 bottom-6 border-l border-[var(--color-rule)] text-[10px] text-[var(--color-muted)]"
            style={{ left: `${m.pct}%` }}
          >
            <span className="ml-1">{m.label}</span>
          </div>
        ))}
        {/* lanes */}
        {LANES.map((lane, i) => (
          <div key={lane.kind} className="absolute right-0 left-0" style={{ top: 28 + i * 56 }}>
            <div className="mb-1 text-xs font-medium" style={{ color: lane.color }}>
              {lane.label}
            </div>
            <div className="relative h-8 rounded bg-[var(--color-paper)]">
              {events
                .filter((e) => e.kind === lane.kind)
                .map((e) => (
                  <button
                    key={e.id}
                    className="absolute top-1 h-6 w-1.5 -translate-x-1/2 rounded-full opacity-70 hover:opacity-100"
                    style={{ left: `${xOf(e.date)}%`, background: lane.color }}
                    onMouseEnter={() => setHover(e)}
                    onMouseLeave={() => setHover(null)}
                    aria-label={e.label}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 min-h-[3rem] rounded bg-[var(--color-paper)] p-2 text-xs">
        {hover ? (
          <>
            <span className="font-mono text-[var(--color-muted)]">
              {new Date(hover.date).toLocaleDateString("en-US")} · {hover.kind}
            </span>
            <p className="mt-0.5">
              {hrefFor(hover) ? (
                <Link href={hrefFor(hover)!} className="hover:underline">
                  {hover.label}
                </Link>
              ) : (
                hover.label
              )}
            </p>
          </>
        ) : (
          <span className="text-[var(--color-muted)]">Hover a marker for detail.</span>
        )}
      </div>
    </div>
  );
}
