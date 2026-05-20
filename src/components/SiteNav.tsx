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
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-6 pt-3 pb-2 sm:pt-4">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] group-hover:animate-pulse" />
            <span className="font-display text-base font-bold tracking-tight sm:text-lg">
              TRUMP&nbsp;STOCK&nbsp;TRACKER
            </span>
          </Link>
          <span className="hidden font-mono text-[0.65rem] text-[var(--color-muted)] sm:block">
            disclosed trades · statements · official actions
          </span>
        </div>
        <nav className="-mx-4 flex items-center gap-x-5 gap-y-1 overflow-x-auto border-t border-[var(--color-rule-soft)] px-4 py-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-x-6 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 py-0.5 font-mono text-[0.78rem] tracking-tight transition-colors ${
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
