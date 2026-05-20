import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t-2 border-[var(--color-ink)] bg-[var(--color-paper-2)]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="kicker">Standing disclaimer</div>
        <p className="mt-3 max-w-3xl font-display text-base leading-relaxed">
          This is a transparency record, not an accusation. It compiles public facts —
          disclosed transactions, public statements, official actions — and scores their
          timing. No evidence presented here establishes that any trade used nonpublic
          information. Correlation is not causation. Lawful trading is lawful.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-rule)] pt-5 font-mono text-xs text-[var(--color-muted)]">
          <span>
            Trump Stock Tracker · disclosed amounts are statutory ranges, not exact figures ·
            data used solely for news and transparency dissemination to the public.
          </span>
          <span className="flex gap-4">
            <Link href="/methodology" className="hover:text-[var(--color-ink)]">
              Methodology
            </Link>
            <Link href="/api-docs" className="hover:text-[var(--color-ink)]">
              API
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
