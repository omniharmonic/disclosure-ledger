/** GET /api/v1/graph — the knowledge graph as nodes + links. */
import { getGraph } from "@/lib/queries";
import { apiOk, apiServerError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const graph = await getGraph();
    return apiOk(graph, { nodes: graph.nodes.length, edges: graph.links.length });
  } catch (err) {
    return apiServerError("graph", err);
  }
}
