import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          A public record of presidential trading — and what surrounds it.
        </h1>
        <p className="mt-4 text-[var(--color-muted)]">
          This platform converts the President&rsquo;s securities-disclosure filings into
          rigorous structured data, layers in his public statements and official government
          actions, and surfaces transparently-scored timing correlations between them.
        </p>
      </section>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/trades"
          className="rounded border border-[var(--color-rule)] px-4 py-2 hover:bg-white"
        >
          Browse trades →
        </Link>
        <Link
          href="/methodology"
          className="rounded border border-[var(--color-rule)] px-4 py-2 hover:bg-white"
        >
          How this works →
        </Link>
      </nav>
      <p className="font-mono text-xs text-[var(--color-muted)]">
        Phase 0 scaffold · dashboard wired in Phase 3.
      </p>
    </div>
  );
}
