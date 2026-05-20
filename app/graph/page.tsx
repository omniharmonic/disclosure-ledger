import type { Metadata } from "next";
import { getGraph } from "@/lib/queries";
import { ForceGraph } from "@/components/ForceGraph";

export const metadata: Metadata = { title: "Graph" };
export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const { nodes, links } = await getGraph();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge graph</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          The President, the companies he traded, his filings, and the statements and official
          actions correlated with those trades — as one explorable network. Drag nodes; hover
          for detail.
        </p>
      </div>
      <ForceGraph nodes={nodes} links={links} />
      <p className="text-xs text-[var(--color-muted)]">
        {nodes.length.toLocaleString()} nodes · {links.length.toLocaleString()} edges. Edges
        are a rebuildable projection of the underlying records.
      </p>
    </div>
  );
}
