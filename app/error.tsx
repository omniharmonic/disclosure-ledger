"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in monitoring; never render internals to the visitor.
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="kicker">Something broke</div>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
        This page failed to load
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        The data layer didn&rsquo;t respond. The record itself is safe — every datum is
        backed by its primary source. Try again in a moment.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[0.65rem] text-[var(--color-muted)]">
          reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <button
          onClick={reset}
          className="rounded border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent)] hover:border-[var(--color-accent)]"
        >
          Try again
        </button>
        <Link href="/" className="rounded border border-[var(--color-rule)] px-4 py-2 hover:border-[var(--color-ink)]">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
