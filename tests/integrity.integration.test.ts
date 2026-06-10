/**
 * Integration regression tests for the trust defects found in the production
 * evaluation (docs/IMPROVEMENT_STRATEGY.md §4). Require a real Postgres at
 * DATABASE_URL; skipped otherwise. Each test creates its own uniquely-keyed
 * rows and removes them afterwards.
 *
 *   D1 — withheld (`review`) filings must not be readable by direct id.
 *   D2 — re-running `correlate` must preserve verification verdicts.
 *   D3 — multiple mention spans must yield ONE correlation per (trade, event).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID, createHash } from "node:crypto";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.runIf(HAS_DB)("public-surface integrity", () => {
  // Imports deferred so a DB-less run never opens a connection.
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let queries: typeof import("@/lib/queries");
  let correlate: typeof import("@/pipeline/stages/correlate").correlate;

  const tag = randomUUID().slice(0, 8);
  const h = (s: string) => createHash("sha256").update(`${tag}:${s}`).digest("hex");

  let personId: string;
  let companyId: string;
  let publicFilingId: string;
  let reviewFilingId: string;
  let publicTxnId: string;
  let hiddenTxnId: string;
  let statementId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    queries = await import("@/lib/queries");
    ({ correlate } = await import("@/pipeline/stages/correlate"));

    [{ id: personId }] = await db
      .insert(schema.persons)
      .values({ fullName: `Test Filer ${tag}`, role: "President" })
      .returning({ id: schema.persons.id });

    [{ id: companyId }] = await db
      .insert(schema.companies)
      .values({ name: `Testco ${tag}`, ticker: `T${tag.slice(0, 4).toUpperCase()}` })
      .returning({ id: schema.companies.id });

    const filing = (status: string, n: number) => ({
      personId,
      formType: "278-T",
      filingDate: "2026-05-01",
      sourceUrl: `https://example.test/${tag}/${n}.pdf`,
      sourceDomain: "example.test",
      pdfHash: h(`pdf${n}`),
      status,
    });
    [{ id: publicFilingId }] = await db
      .insert(schema.filings)
      .values(filing("parsed", 1))
      .returning({ id: schema.filings.id });
    [{ id: reviewFilingId }] = await db
      .insert(schema.filings)
      .values(filing("review", 2))
      .returning({ id: schema.filings.id });

    const txn = (filingId: string, n: number) => ({
      filingId,
      personId,
      companyId,
      rowNumber: n,
      descriptionRaw: `TESTCO ${tag} COM ROW ${n}`,
      transactionType: "Purchase",
      transactionDate: "2026-04-10",
      amountBand: 7,
      amountMin: 1_000_001,
      amountMax: 5_000_000,
    });
    [{ id: publicTxnId }] = await db
      .insert(schema.transactions)
      .values(txn(publicFilingId, 1))
      .returning({ id: schema.transactions.id });
    [{ id: hiddenTxnId }] = await db
      .insert(schema.transactions)
      .values(txn(reviewFilingId, 1))
      .returning({ id: schema.transactions.id });

    [{ id: statementId }] = await db
      .insert(schema.statements)
      .values({
        personId,
        spokenAt: "2026-04-08",
        channel: "truth_social",
        fullText: `Testco ${tag} is doing GREAT things. $T${tag.slice(0, 4).toUpperCase()} to the moon.`,
        source: "truth_social",
        sourceUrl: `https://example.test/${tag}/post`,
        attributionMethod: "official_transcript",
        attributionConf: 1,
        contentHash: h("stmt"),
      })
      .returning({ id: schema.statements.id });

    // Two spans for the same (statement, company) — the D3 trigger condition.
    await db.insert(schema.statementMentions).values([
      {
        statementId,
        companyId,
        exactQuote: `Testco ${tag} is doing GREAT things`,
        charStart: 0,
        charEnd: 20,
        confidence: 0.6,
        method: "gazetteer",
      },
      {
        statementId,
        companyId,
        exactQuote: `$T${tag.slice(0, 4).toUpperCase()}`,
        charStart: 30,
        charEnd: 36,
        confidence: 0.6,
        method: "gazetteer",
      },
    ]);
  });

  afterAll(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    await db
      .delete(schema.filings)
      .where(inArray(schema.filings.id, [publicFilingId, reviewFilingId])); // cascades txns + correlations
    await db.delete(schema.statements).where(eq(schema.statements.id, statementId)); // cascades mentions
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    await db.delete(schema.persons).where(eq(schema.persons.id, personId));
  });

  // ---- D1 — withheld filings are not readable by direct id ----------------

  it("getTransaction returns null for a transaction in a review-status filing", async () => {
    expect(await queries.getTransaction(hiddenTxnId)).toBeNull();
  });

  it("getTransaction returns the row for a public filing", async () => {
    const row = await queries.getTransaction(publicTxnId);
    expect(row?.id).toBe(publicTxnId);
  });

  it("getFiling returns null for a review-status filing", async () => {
    expect(await queries.getFiling(reviewFilingId)).toBeNull();
    expect((await queries.getFiling(publicFilingId))?.filing.id).toBe(publicFilingId);
  });

  it("getCorrelations is empty for a hidden transaction", async () => {
    expect(await queries.getCorrelations(hiddenTxnId)).toEqual([]);
  });

  it("malformed ids return null/empty instead of throwing (no HTTP 500)", async () => {
    expect(await queries.getTransaction("not-a-uuid")).toBeNull();
    expect(await queries.getFiling("'; DROP TABLE filings;--")).toBeNull();
    expect(await queries.getCorrelations("zzz")).toEqual([]);
  });

  // ---- D2 + D3 — correlate semantics ---------------------------------------

  it("D3: one correlation per (trade, statement) pair despite multiple mention spans", async () => {
    const { and, eq } = await import("drizzle-orm");
    await correlate();
    const rows = await db
      .select({ id: schema.correlations.id })
      .from(schema.correlations)
      .where(
        and(
          eq(schema.correlations.transactionId, publicTxnId),
          eq(schema.correlations.statementId, statementId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("D3: hidden trades get no correlations at all", async () => {
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ id: schema.correlations.id })
      .from(schema.correlations)
      .where(eq(schema.correlations.transactionId, hiddenTxnId));
    expect(rows).toHaveLength(0);
  });

  it("D2: re-running correlate preserves verification verdicts", async () => {
    const { and, eq } = await import("drizzle-orm");
    const pair = and(
      eq(schema.correlations.transactionId, publicTxnId),
      eq(schema.correlations.statementId, statementId),
    );

    await db
      .update(schema.correlations)
      .set({ verifiedGenuine: false, verdictReason: "test: string coincidence" })
      .where(pair);

    await correlate(); // the full re-scoring run that previously wiped verdicts

    const [row] = await db
      .select({
        verifiedGenuine: schema.correlations.verifiedGenuine,
        verdictReason: schema.correlations.verdictReason,
      })
      .from(schema.correlations)
      .where(pair);
    expect(row?.verifiedGenuine).toBe(false);
    expect(row?.verdictReason).toBe("test: string coincidence");
  });

  it("D2: correlate is idempotent — same pair count across consecutive runs", async () => {
    const { eq } = await import("drizzle-orm");
    const count = async () =>
      (
        await db
          .select({ id: schema.correlations.id })
          .from(schema.correlations)
          .where(eq(schema.correlations.transactionId, publicTxnId))
      ).length;
    const before = await count();
    await correlate();
    expect(await count()).toBe(before);
  });
});
