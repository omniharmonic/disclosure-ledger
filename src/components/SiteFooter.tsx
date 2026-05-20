export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="mx-auto max-w-7xl px-6 py-10 text-xs leading-relaxed text-[var(--color-muted)]">
        <p className="max-w-3xl">
          <strong className="text-[var(--color-ink)]">Disclosure Ledger</strong> is a
          civic-transparency project. It compiles public records: securities transactions
          disclosed under the Ethics in Government Act and the STOCK Act, the President&rsquo;s
          public statements, and official government actions. Disclosed amounts are statutory
          ranges, not exact figures. Timing correlations are presented as facts and
          transparently-scored signals — <em>not</em> as findings of illegality. No evidence
          presented here establishes that any trade used nonpublic information; correlation is
          not causation; lawful trading is lawful.
        </p>
        <p className="mt-4">
          Project by Benjamin Life (@omniharmonic) · OpenCivics. Data used solely for news and
          transparency dissemination to the general public.
        </p>
      </div>
    </footer>
  );
}
