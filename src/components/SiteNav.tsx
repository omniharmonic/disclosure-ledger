import Link from "next/link";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/timeline", label: "Timeline" },
  { href: "/graph", label: "Graph" },
  { href: "/filings", label: "Filings" },
  { href: "/methodology", label: "Methodology" },
  { href: "/api-docs", label: "API" },
];

export function SiteNav() {
  return (
    <header className="border-b border-[var(--color-rule)] bg-[var(--color-paper)]">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="mr-2 font-mono text-sm font-bold tracking-tight">
          DISCLOSURE&nbsp;LEDGER
        </Link>
        {LINKS.slice(1).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
