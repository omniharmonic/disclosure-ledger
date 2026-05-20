"use client";

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";

export interface PricePoint {
  date: string;
  close: number;
}
export interface TradeMarker {
  date: string;
  type: string;
  priceAtTxn: number | null;
}

/** EOD price history with the President's disclosed trades plotted on it. */
export function PriceChart({
  prices,
  trades,
}: {
  prices: PricePoint[];
  trades: TradeMarker[];
}) {
  if (prices.length < 2) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-rule)] p-6 text-center text-sm text-[var(--color-muted)]">
        No price history available for this ticker yet.
      </p>
    );
  }

  // Price history is weekly, so trade dates rarely land exactly on a data
  // point — snap each marker to the nearest weekly date on the axis.
  const markers = trades
    .filter((t) => t.priceAtTxn != null)
    .map((t) => {
      const tTime = Date.parse(t.date);
      let nearest = prices[0];
      for (const p of prices) {
        if (Math.abs(Date.parse(p.date) - tTime) < Math.abs(Date.parse(nearest.date) - tTime)) {
          nearest = p;
        }
      }
      return { date: nearest.date, type: t.type, priceAtTxn: t.priceAtTxn };
    });

  return (
    <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={prices} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="px" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16140f" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#16140f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            minTickGap={48}
            tickFormatter={(d: string) => d.slice(2, 7)}
            stroke="#857b6d"
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            width={48}
            stroke="#857b6d"
            tickFormatter={(v: number) => `$${v}`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              border: "1px solid #d3cab6",
              background: "#fbfaf5",
            }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, "close"]}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="#16140f"
            strokeWidth={1.4}
            fill="url(#px)"
          />
          {markers.map((m, i) => (
            <ReferenceDot
              key={i}
              x={m.date}
              y={m.priceAtTxn!}
              r={5}
              fill={m.type.startsWith("Purchase") ? "#146b5c" : "#9c1f1f"}
              stroke="#fbfaf5"
              strokeWidth={1.5}
              isFront
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 font-mono text-[0.7rem] text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-buy)]" /> purchase
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-sell)]" /> sale
        </span>
        <span>end-of-day close · markers placed on disclosed trade dates</span>
      </div>
    </div>
  );
}
