/**
 * Stage 8 — Graph build.
 *
 * Rebuilds the `graph_edges` projection from the authoritative tables. The
 * graph is company-centric: individual transactions are aggregated into
 * person→company TRADED edges rather than thousands of trade nodes, keeping
 * the force-directed view legible.
 *
 * Idempotent: the table is truncated and rebuilt every run.
 */
import { db } from "@/db";
import { graphEdges, transactions, filings, actionTargets, correlations } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type EdgeRow = typeof graphEdges.$inferInsert;

export interface GraphResult {
  nodes: number;
  edges: number;
}

/** Rebuild the knowledge-graph edge projection. */
export async function buildGraph(): Promise<GraphResult> {
  await db.delete(graphEdges);
  const edges: EdgeRow[] = [];

  // person → company  (TRADED, weight = trade count)
  const traded = await db
    .select({
      personId: transactions.personId,
      companyId: transactions.companyId,
      n: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(
      and(
        inArray(filings.status, ["parsed", "published"]),
        sql`${transactions.companyId} is not null`,
        sql`${transactions.personId} is not null`,
      ),
    )
    .groupBy(transactions.personId, transactions.companyId);
  for (const r of traded) {
    if (!r.personId || !r.companyId) continue;
    edges.push({
      srcType: "person", srcId: r.personId,
      dstType: "company", dstId: r.companyId,
      relType: "TRADED", weight: Number(r.n),
      properties: { tradeCount: Number(r.n) },
    });
  }

  // person → filing  (FILED)
  const filed = await db
    .select({ personId: filings.personId, filingId: filings.id })
    .from(filings)
    .where(inArray(filings.status, ["parsed", "published"]));
  for (const r of filed) {
    if (!r.personId) continue;
    edges.push({
      srcType: "person", srcId: r.personId,
      dstType: "filing", dstId: r.filingId,
      relType: "FILED", weight: 1, properties: {},
    });
  }

  // Raw statement mentions are deliberately NOT graph edges — only *scored*
  // correlations (CORRELATES_WITH, below) are, so the graph stays legible.

  // company → action  (AFFECTED_BY)
  const targets = await db
    .select({ companyId: actionTargets.companyId, actionId: actionTargets.actionId })
    .from(actionTargets)
    .groupBy(actionTargets.companyId, actionTargets.actionId);
  for (const r of targets) {
    if (!r.companyId) continue;
    edges.push({
      srcType: "company", srcId: r.companyId,
      dstType: "action", dstId: r.actionId,
      relType: "AFFECTED_BY", weight: 1, properties: {},
    });
  }

  // company → event  (CORRELATES_WITH, weight = peak signal score)
  const corr = await db
    .select({
      companyId: transactions.companyId,
      eventKind: correlations.eventKind,
      statementId: correlations.statementId,
      actionId: correlations.actionId,
      peak: sql<number>`max(${correlations.signalScore})`,
    })
    .from(correlations)
    .innerJoin(transactions, eq(correlations.transactionId, transactions.id))
    .groupBy(
      transactions.companyId,
      correlations.eventKind,
      correlations.statementId,
      correlations.actionId,
    );
  for (const r of corr) {
    if (!r.companyId) continue;
    const dstId = r.eventKind === "statement" ? r.statementId : r.actionId;
    if (!dstId) continue;
    edges.push({
      srcType: "company", srcId: r.companyId,
      dstType: r.eventKind, dstId,
      relType: "CORRELATES_WITH", weight: Number(r.peak),
      properties: { peakSignal: Number(r.peak) },
    });
  }

  if (edges.length > 0) {
    for (let i = 0; i < edges.length; i += 500) {
      await db.insert(graphEdges).values(edges.slice(i, i + 500));
    }
  }

  const nodeIds = new Set<string>();
  for (const e of edges) {
    nodeIds.add(`${e.srcType}:${e.srcId}`);
    nodeIds.add(`${e.dstType}:${e.dstId}`);
  }
  const result = { nodes: nodeIds.size, edges: edges.length };
  console.log(`[graph-build] ${result.edges} edges, ${result.nodes} nodes`);
  return result;
}
