"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CompanyListItem } from "@/lib/queries";

type SortKey = "correlations" | "trades" | "ticker" | "name" | "sector";

/** Searchable, sector-filterable, sortable companies table with clickable rows. */
export function CompaniesTable({ companies }: { companies: CompanyListItem[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("correlations");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");

  const sectors = useMemo(
    () => [...new Set(companies.map((c) => c.sector).filter(Boolean))].sort() as string[],
    [companies],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = companies;
    if (q) {
      r = r.filter(
        (c) => (c.ticker ?? "").toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
      );
    }
    if (sector) r = r.filter((c) => c.sector === sector);
    return [...r].sort((a, b) => {
      switch (sort) {
        case "ticker":
          return (a.ticker ?? "~").localeCompare(b.ticker ?? "~");
        case "name":
          return a.name.localeCompare(b.name);
        case "sector":
          return (a.sector ?? "~").localeCompare(b.sector ?? "~");
        case "trades":
          return b.tradeCount - a.tradeCount;
        default:
          return b.correlationCount - a.correlationCount || b.tradeCount - a.tradeCount;
      }
    });
  }, [companies, query, sector, sort]);

  const Th = ({ k, label, right }: { k?: SortKey; label: string; right?: boolean }) => (
    <th
      className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"} ${
        k ? "cursor-pointer select-none hover:text-[var(--color-ink)]" : ""
      }`}
      onClick={k ? () => setSort(k) : undefined}
    >
      {label}
      {k && sort === k ? " ▾" : ""}
    </th>
  );

  const input =
    "rounded border border-[var(--color-rule)] bg-[var(--color-card)] px-3 py-1.5 font-mono text-xs";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={input}
          placeholder="search ticker or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className={input} value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={input}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="correlations">Sort: correlations</option>
          <option value="trades">Sort: trades</option>
          <option value="ticker">Sort: ticker (A–Z)</option>
          <option value="name">Sort: name (A–Z)</option>
          <option value="sector">Sort: sector</option>
        </select>
        <span className="font-mono text-xs text-[var(--color-muted)]">
          {rows.length} of {companies.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-rule)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-rule)] bg-[var(--color-card)] text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">
              <Th k="ticker" label="Ticker" />
              <Th k="name" label="Company" />
              <Th k="sector" label="Sector" />
              <Th k="trades" label="Trades" right />
              <Th k="correlations" label="Correlations" right />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/companies/${encodeURIComponent(c.ticker ?? c.name)}`)}
                className="cursor-pointer border-b border-[var(--color-rule-soft)] last:border-0 hover:bg-[var(--color-card)]"
              >
                <td className="px-3 py-2 font-mono font-bold text-[var(--color-accent)]">
                  {c.ticker ?? "—"}
                </td>
                <td className="px-3 py-2 text-[var(--color-ink-soft)]">{c.name}</td>
                <td className="px-3 py-2 text-[var(--color-muted)]">{c.sector ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular">{c.tradeCount}</td>
                <td className="px-3 py-2 text-right tabular">
                  {c.correlationCount > 0 ? (
                    <span className="font-semibold text-[var(--color-accent)]">
                      {c.correlationCount}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">0</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">
                  No companies match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
