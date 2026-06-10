import Link from "next/link";
import type { Metadata } from "next";
import { listCompanies } from "@/lib/queries";
import { safeLoad } from "@/lib/safe-load";
import { CompaniesTable } from "@/components/CompaniesTable";

export const metadata: Metadata = { title: "Companies" };
/** ISR — data changes at most once per pipeline run; revalidated on a timer
 *  and on demand via /api/revalidate after each run (ARCHITECTURE §7.2). */
export const revalidate = 300;

export default async function CompaniesPage() {
  const companies = await safeLoad("companies", listCompanies, []);
  const correlated = companies.filter((c) => c.correlationCount > 0);
  const featured = correlated.slice(0, 6);

  return (
    <div className="space-y-10">
      <header className="rise max-w-2xl">
        <div className="kicker">Resolved equity universe</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Companies in the disclosures
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Every publicly-traded company the President&rsquo;s filings resolve to, ranked by how
          much surrounding activity — statements and official actions — correlates with his
          trades in it.
        </p>
      </header>

      {featured.length > 0 && (
        <section>
          <div className="kicker mb-3">Most correlated companies</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c, i) => (
              <Link
                key={c.id}
                href={`/companies/${encodeURIComponent(c.ticker ?? c.name)}`}
                className="rise group rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4 transition-colors hover:border-[var(--color-accent)]"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-lg font-bold">{c.ticker ?? "—"}</span>
                  <span
                    className="font-display text-2xl font-semibold"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {c.correlationCount}
                  </span>
                </div>
                <div className="mt-1 line-clamp-1 text-sm text-[var(--color-ink-soft)]">
                  {c.name}
                </div>
                <div className="mt-2 flex justify-between text-[0.7rem] text-[var(--color-muted)]">
                  <span>{c.sector ?? "—"}</span>
                  <span>{c.tradeCount} trades · {c.correlationCount} correlations</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="kicker mb-3">All companies · {companies.length} · click a row</div>
        <CompaniesTable companies={companies} />
      </section>
    </div>
  );
}
