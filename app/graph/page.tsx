import type { Metadata } from "next";
import { getGraph } from "@/lib/queries";
import { safeLoad } from "@/lib/safe-load";
import { GraphExplorer } from "@/components/GraphExplorer";

export const metadata: Metadata = { title: "Graph" };
/** ISR — data changes at most once per pipeline run; revalidated on a timer
 *  and on demand via /api/revalidate after each run (ARCHITECTURE §7.2). */
export const revalidate = 300;

export default async function GraphPage() {
  const { nodes, links } = await safeLoad("graph", getGraph, { nodes: [], links: [] });
  return (
    <div className="space-y-6">
      <header className="rise max-w-2xl">
        <div className="kicker">Knowledge graph</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          The network of influence
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          The President, the companies he traded, and the statements and official actions
          correlated with those trades — one explorable network. Click a node to inspect it and
          walk its connections. Toggle off un-correlated companies to see only where a paper
          trail exists.
        </p>
      </header>
      <GraphExplorer nodes={nodes} links={links} />
    </div>
  );
}
