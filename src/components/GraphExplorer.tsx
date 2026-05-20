"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, GraphLink } from "@/lib/queries";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const NODE_COLOR: Record<string, string> = {
  person: "#1a1714",
  company: "#8a1a1a",
  statement: "#1f6f43",
  action: "#9a6b00",
  filing: "#8a8073",
};
const NODE_LABEL: Record<string, string> = {
  person: "Person",
  company: "Company",
  statement: "Statement",
  action: "Official action",
  filing: "Filing",
};
/** Relations that mean a company is connected to something beyond mere trading. */
const EVENT_RELS = new Set(["CORRELATES_WITH", "AFFECTED_BY"]);

const REL_PHRASE: Record<string, string> = {
  TRADED: "traded",
  FILED: "filed",
  AFFECTED_BY: "policy action affecting",
  CORRELATES_WITH: "timing-correlated with",
  MENTIONED_IN: "mentioned in",
};
function relPhrase(rel: string): string {
  return REL_PHRASE[rel] ?? rel.toLowerCase().replace(/_/g, " ");
}

interface FGNode extends GraphNode {
  x?: number;
  y?: number;
}

export function GraphExplorer({
  nodes,
  links,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ centerAt: (x: number, y: number, ms: number) => void; zoom: (z: number, ms: number) => void } | null>(null);
  const [width, setWidth] = useState(800);
  const [onlyEvents, setOnlyEvents] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fix the canvas overflowing its container: measure and pass an explicit width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Companies that participate in a statement/action correlation.
  const companiesWithEvents = useMemo(() => {
    const set = new Set<string>();
    for (const l of links) {
      if (EVENT_RELS.has(l.rel)) {
        set.add(typeof l.source === "string" ? l.source : (l.source as FGNode).id);
      }
    }
    return set;
  }, [links]);

  // Visible subgraph, honouring the orphan-filter toggle.
  const data = useMemo(() => {
    let vNodes = nodes;
    let vLinks = links;
    if (onlyEvents) {
      const keep = new Set<string>();
      for (const n of nodes) {
        if (n.type === "person") keep.add(n.id);
        else if (n.type === "company" && companiesWithEvents.has(n.id)) keep.add(n.id);
        else if (n.type === "statement" || n.type === "action") keep.add(n.id);
      }
      vLinks = links.filter((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as FGNode).id;
        const t = typeof l.target === "string" ? l.target : (l.target as FGNode).id;
        return keep.has(s) && keep.has(t);
      });
      const linked = new Set<string>();
      for (const l of vLinks) {
        linked.add(typeof l.source === "string" ? l.source : (l.source as FGNode).id);
        linked.add(typeof l.target === "string" ? l.target : (l.target as FGNode).id);
      }
      vNodes = nodes.filter((n) => linked.has(n.id));
    }
    return {
      nodes: vNodes.map((n) => ({ ...n })),
      links: vLinks.map((l) => ({ ...l })),
    };
  }, [nodes, links, onlyEvents, companiesWithEvents]);

  // Neighbours of the selected node, for the inspector panel.
  const neighbours = useMemo(() => {
    if (!selectedId) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: { node: GraphNode; rel: string; weight: number }[] = [];
    for (const l of links) {
      const s = typeof l.source === "string" ? l.source : (l.source as FGNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as FGNode).id;
      const w = l.weight ?? 1;
      if (s === selectedId && byId.get(t)) out.push({ node: byId.get(t)!, rel: l.rel, weight: w });
      else if (t === selectedId && byId.get(s)) out.push({ node: byId.get(s)!, rel: l.rel, weight: w });
    }
    return out.sort((a, b) => b.weight - a.weight);
  }, [selectedId, nodes, links]);

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;

  if (nodes.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-rule)] p-10 text-center text-sm text-[var(--color-muted)]">
        The knowledge graph is empty — run the pipeline&rsquo;s correlate &rarr; graph stages.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onlyEvents}
              onChange={(e) => setOnlyEvents(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Only companies with statements or actions
          </label>
          <span className="kicker">
            {data.nodes.length} nodes · {data.links.length} edges
          </span>
        </div>
        <div ref={wrapRef} className="relative">
          <ForceGraph2D
            ref={fgRef as never}
            graphData={data}
            width={width}
            height={520}
            backgroundColor="#fbfaf5"
            nodeRelSize={4}
            nodeVal={(n) => Math.min(40, (n as FGNode).val)}
            nodeColor={(n) =>
              (n as FGNode).id === selectedId
                ? "#000"
                : NODE_COLOR[(n as FGNode).type] ?? "#999"}
            nodeLabel={(n) => `${NODE_LABEL[(n as FGNode).type]}: ${(n as FGNode).label}`}
            linkColor={() => "rgba(26,23,20,0.13)"}
            linkWidth={(l) => Math.min(3, ((l as GraphLink).weight ?? 1) / 30 + 0.4)}
            onNodeClick={(n) => {
              const node = n as FGNode;
              setSelectedId(node.id);
              if (fgRef.current && node.x != null && node.y != null) {
                fgRef.current.centerAt(node.x, node.y, 600);
                fgRef.current.zoom(3, 600);
              }
            }}
            cooldownTicks={140}
          />
        </div>
        <div className="flex flex-wrap gap-4 border-t border-[var(--color-rule)] px-4 py-2 text-[0.7rem]">
          {Object.entries(NODE_COLOR).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {NODE_LABEL[type]}
            </span>
          ))}
        </div>
      </div>

      <aside className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4">
        {!selected ? (
          <p className="text-sm text-[var(--color-muted)]">
            Click any node to inspect it and trace its connections through the network.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="kicker">{NODE_LABEL[selected.type]}</div>
              <div className="font-display text-base leading-tight">{selected.label}</div>
              {selected.sub && (
                <div className="mt-0.5 font-mono text-[0.65rem] text-[var(--color-muted)]">
                  {selected.sub}
                </div>
              )}
            </div>
            {selected.detail && selected.detail !== selected.label && (
              <p className="border-l-2 border-[var(--color-rule)] pl-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                {selected.detail}
                {selected.detail.length >= 350 ? "…" : ""}
              </p>
            )}
            {selected.type === "company" && (
              <Link
                href={`/companies/${encodeURIComponent(selected.label)}`}
                className="inline-block text-xs font-medium text-[var(--color-accent)] hover:underline"
              >
                Open company page &rarr;
              </Link>
            )}
            <div>
              <div className="kicker mb-1.5">
                {neighbours.length} connection{neighbours.length === 1 ? "" : "s"}
              </div>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {neighbours.map((nb, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setSelectedId(nb.node.id)}
                      className="w-full rounded border border-[var(--color-rule-soft)] px-2 py-1.5 text-left text-xs hover:border-[var(--color-accent)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[0.6rem] uppercase text-[var(--color-muted)]">
                          {relPhrase(nb.rel)}
                        </span>
                        {nb.rel === "CORRELATES_WITH" && (
                          <span className="font-mono text-[0.65rem] font-bold text-[var(--color-accent)]">
                            signal {nb.weight.toFixed(0)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: NODE_COLOR[nb.node.type] }}
                        />
                        <span className="line-clamp-2">{nb.node.label}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
