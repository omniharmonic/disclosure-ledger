import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="kicker">404 — not on the record</div>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
        This page doesn&rsquo;t exist
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        The page may have moved, or the record you&rsquo;re looking for isn&rsquo;t publicly
        released — filings below the extraction-confidence threshold are withheld until a
        human review confirms them.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <Link
          href="/trades"
          className="rounded border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent)] hover:border-[var(--color-accent)]"
        >
          Browse all trades →
        </Link>
        <Link href="/" className="rounded border border-[var(--color-rule)] px-4 py-2 hover:border-[var(--color-ink)]">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
