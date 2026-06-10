/**
 * Build/runtime-safe data loading for ISR pages.
 *
 * ISR pages are prerendered at BUILD time, which means `next build` talks to
 * the production database. A deploy must never be hostage to database state —
 * an unreachable DB, a schema that hasn't been migrated yet, a Neon cold
 * start — so page-level loads degrade to their empty-state fallback instead
 * of failing the build (this exact failure took down the Vercel deploy: the
 * push-managed production schema predated the new columns, the first
 * prerender query threw, and the whole build aborted).
 *
 * The degraded page is cached at most `revalidate` seconds; the next
 * regeneration against a healthy database replaces it. Request-dynamic routes
 * (trade/company/filing detail, /trades) are unaffected — they render per
 * request and surface failures through error.tsx.
 */
export async function safeLoad<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[safe-load] ${label}: database unavailable — rendering fallback.`, err);
    return fallback;
  }
}
