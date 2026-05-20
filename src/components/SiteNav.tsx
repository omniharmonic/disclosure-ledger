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
        <div className="flex items-end justify-between gap-6 pt-5 pb-2">
          <Link href="/" className="group">
            <div className="kicker mb-0.5">Civic Accountability Record</div>
            <div className="font-display text-2xl font-semibold leading-none tracking-tight">
              Disclosure&nbsp;Ledger
            </div>
          </Link>
          <span className="hidden text-right text-[0.7rem] leading-tight text-[var(--color-muted)] sm:block">
            Presidential trades · statements · official actions
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--color-rule-soft)] py-2">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-[0.8rem] font-medium tracking-wide transition-colors ${
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                }`}
              >
                {l.label}
                {active && (
                  <span className="ml-1.5 inline-block h-1 w-1 rounded-full bg-[var(--color-accent)] align-middle" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
