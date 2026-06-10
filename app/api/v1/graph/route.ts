/**
 * GET /api/v1/graph — the knowledge graph.
 *
 * Without params: the full company-aggregated graph (small by construction —
 * trades are rolled up into person→company edges).
 * With ?node=<type>:<uuid>&depth=<1..3>: a bounded breadth-first neighborhood
 * of one node (FR-W7 lazy expansion) — hard-capped so this path can never
 * pull the whole edge table.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getGraph, getGraphNeighborhood } from "@/lib/queries";
import { apiOk, apiServerError, parseQuery } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const graphQuery = z.object({
  node: z
    .string()
    .regex(
      /^(person|company|filing|statement|action):[0-9a-f-]{36}$/i,
      "expected <type>:<uuid>",
    )
    .optional(),
  depth: z.coerce.number().int().min(1).max(3).default(2),
});

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  const parsed = parseQuery(new URL(req.url), graphQuery);
  if (!parsed.ok) return parsed.response;
  const { node, depth } = parsed.params;

  try {
    const graph = node
      ? await getGraphNeighborhood(node.split(":")[0], node.split(":")[1], depth)
      : await getGraph();
    return apiOk(
      graph,
      { nodes: graph.nodes.length, edges: graph.links.length, ...(node ? { node, depth } : {}) },
      gate.headers,
    );
  } catch (err) {
    return apiServerError("graph", err);
  }
}
