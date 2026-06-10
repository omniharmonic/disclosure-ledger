import type { Metadata } from "next";
import { OPENAPI_SPEC } from "@/lib/openapi";
import { ANONYMOUS_DAILY_LIMIT, DEFAULT_KEY_DAILY_LIMIT } from "@/lib/ratelimit";

export const metadata: Metadata = {
  title: "API",
  description: "Read-only public API over the structured disclosure dataset.",
};

interface PathItem {
  summary?: string;
  description?: string;
  parameters?: { name: string; in: string }[];
}

/**
 * Rendered directly from the OpenAPI specification (`src/lib/openapi.ts`) —
 * the same object served at /api/v1/openapi.json — so this page can never
 * drift from the actual contract.
 */
export default function ApiDocsPage() {
  const paths = Object.entries(OPENAPI_SPEC.paths) as [string, { get?: PathItem }][];

  return (
    <article className="max-w-3xl space-y-5 text-sm leading-relaxed">
      <header className="rise">
        <div className="kicker">Open data</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Public API</h1>
        <p className="mt-3 text-[var(--color-ink-soft)]">
          A read-only JSON API over the structured dataset. Every list response uses a
          consistent envelope: <code className="font-mono">{`{ data, meta }`}</code> with
          totals and pagination in <code className="font-mono">meta</code>. The full machine
          spec is at{" "}
          <a href="/api/v1/openapi.json" className="text-[var(--color-accent)] underline">
            /api/v1/openapi.json
          </a>
          .
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4">
        <div className="kicker">Authentication &amp; limits</div>
        <p className="mt-2">
          No key is required: anonymous callers get {ANONYMOUS_DAILY_LIMIT} requests/day per
          IP. With an API key (sent as the <code className="font-mono">X-API-Key</code>{" "}
          header) the default limit is {DEFAULT_KEY_DAILY_LIMIT}/day. Current usage is
          returned in <code className="font-mono">X-RateLimit-*</code> headers on every
          response. For a key, contact the address in the spec.
        </p>
      </section>

      <div className="space-y-2">
        {paths.map(([path, item]) => {
          const get = item.get;
          if (!get) return null;
          const queryParams = (get.parameters ?? []).filter((p) => p.in === "query");
          return (
            <div key={path} className="rounded border border-[var(--color-rule)] bg-[var(--color-card)] p-3">
              <code className="font-mono text-sm font-semibold">GET /api/v1{path}</code>
              <p className="mt-1 text-[var(--color-ink-soft)]">{get.summary}</p>
              {get.description && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">{get.description}</p>
              )}
              {queryParams.length > 0 && (
                <p className="mt-1.5 font-mono text-xs text-[var(--color-muted)]">
                  params: {queryParams.map((p) => p.name).join(" · ")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Data is published solely for news and transparency dissemination to the general
        public (5&nbsp;U.S.C. §&nbsp;13107(c)). Disclosed amounts are statutory ranges, never
        exact figures. Correlation scores are analytical indices, never findings of
        wrongdoing.
      </p>
    </article>
  );
}
