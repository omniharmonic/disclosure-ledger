"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { TRANSACTION_TYPES } from "@/lib/format";

/** URL-state filter bar for the trades table. */
export function TradeFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page"); // any filter change resets pagination
      router.push(`/trades?${next.toString()}`);
    },
    [params, router],
  );

  const input =
    "rounded border border-[var(--color-rule)] bg-white px-3 py-1.5 text-sm";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
        Search
        <input
          className={input}
          defaultValue={params.get("search") ?? ""}
          placeholder="company, ticker, security…"
          onKeyDown={(e) => {
            if (e.key === "Enter") update("search", (e.target as HTMLInputElement).value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
        Type
        <select
          className={input}
          defaultValue={params.get("type") ?? ""}
          onChange={(e) => update("type", e.target.value)}
        >
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
        From
        <input
          type="date"
          className={input}
          defaultValue={params.get("dateFrom") ?? ""}
          onChange={(e) => update("dateFrom", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
        To
        <input
          type="date"
          className={input}
          defaultValue={params.get("dateTo") ?? ""}
          onChange={(e) => update("dateTo", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
        Min amount
        <select
          className={input}
          defaultValue={params.get("bandMin") ?? ""}
          onChange={(e) => update("bandMin", e.target.value)}
        >
          <option value="">Any</option>
          <option value="6">$500K+</option>
          <option value="7">$1M+</option>
          <option value="8">$5M+</option>
          <option value="10">$50M+</option>
        </select>
      </label>
      {params.toString() && (
        <button
          className="rounded border border-[var(--color-rule)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          onClick={() => router.push("/trades")}
        >
          Clear
        </button>
      )}
    </div>
  );
}
