import type { Metadata } from "next";

export const metadata: Metadata = { title: "API" };

const ENDPOINTS = [
  ["GET /api/v1/transactions", "Query disclosed transactions — search, type, date range, amount band, pagination."],
  ["GET /api/v1/filings", "List all publicly-released filings with parse metadata."],
];

export default function ApiDocsPage() {
  return (
    <article className="max-w-3xl space-y-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Public API</h1>
      <p className="text-[var(--color-muted)]">
        A read-only JSON API over the structured dataset. Every response uses a consistent
        envelope: <code className="font-mono">{`{ data, meta }`}</code>. Authentication and
        per-key rate limiting are added in Phase 4; the endpoints below are live now.
      </p>
      <div className="space-y-2">
        {ENDPOINTS.map(([ep, desc]) => (
          <div key={ep} className="rounded border border-[var(--color-rule)] bg-white p-3">
            <code className="font-mono text-sm font-semibold">{ep}</code>
            <p className="mt-1 text-[var(--color-muted)]">{desc}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-xs text-[var(--color-muted)]">
        Full OpenAPI spec, bulk export, and API keys land in Phase 4.
      </p>
    </article>
  );
}
