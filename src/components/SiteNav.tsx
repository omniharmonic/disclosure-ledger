"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/trades", label: "Trades" },
  { href: "/companies", label: "Companies" },
  { href: "/timeline", label: "Timeline" },
  { href: "/graph", label: "Graph" },
  { href: "/filings", label: "Filings" },
  { href: "/methodology", label: "Methodology" },
  { href: "/api-docs", label: "API" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-rule)] bg-[var(--color-paper)]/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between gap-6 pt-4 pb-2">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] group-hover:animate-pulse" />
            <span className="font-display text-lg font-bold tracking-tight">
              TRUMP&nbsp;STOCK&nbsp;TRACKER
            </span>
          </Link>
          <span className="hidden font-mono text-[0.65rem] text-[var(--color-muted)] sm:block">
            disclosed trades · statements · official actions
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--color-rule-soft)] py-2">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`font-mono text-[0.78rem] tracking-tight transition-colors ${
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                }`}
              >
                {active ? "▸ " : ""}
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
