import { useMemo } from "react";
import type { GraphNode, GraphLink } from "@/lib/queries";

/**
 * react-force-graph mutates the objects it receives (it attaches x/y/vx/vy).
 * Memoising a fresh copy keeps the simulation stable across re-renders.
 */
export function useMemoizedGraph(nodes: GraphNode[], links: GraphLink[]) {
  return useMemo(
    () => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }),
    [nodes, links],
  );
}
