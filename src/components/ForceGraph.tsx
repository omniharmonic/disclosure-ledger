"use client";

import dynamic from "next/dynamic";
import { useMemoizedGraph } from "./useMemoizedGraph";
import type { GraphNode, GraphLink } from "@/lib/queries";

// react-force-graph touches the canvas/window — load it client-only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const NODE_COLOR: Record<string, string> = {
  person: "#14110e",
  company: "#8a1a1a",
  statement: "#1f6f43",
  action: "#b8860b",
  filing: "#6b6459",
};

export function ForceGraph({
  nodes,
  links,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
}) {
  const data = useMemoizedGraph(nodes, links);

  if (nodes.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-rule)] p-8 text-center text-sm text-[var(--color-muted)]">
        The knowledge graph is empty — run the pipeline&rsquo;s enrich → correlate → graph
        stages to populate it.
      </p>
    );
  }

  return (
    <div className="rounded border border-[var(--color-rule)] bg-white">
      <ForceGraph2D
        graphData={data}
        height={560}
        nodeRelSize={5}
        nodeColor={(n) => NODE_COLOR[(n as GraphNode).type] ?? "#999"}
        nodeLabel={(n) => `${(n as GraphNode).type}: ${(n as GraphNode).label}`}
        linkColor={() => "rgba(20,17,14,0.15)"}
        linkWidth={(l) => Math.min(4, ((l as GraphLink).weight ?? 1) / 25 + 0.4)}
        linkDirectionalParticles={0}
        cooldownTicks={120}
      />
      <div className="flex flex-wrap gap-4 border-t border-[var(--color-rule)] px-4 py-2 text-xs">
        {Object.entries(NODE_COLOR).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: color }}
            />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
