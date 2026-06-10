import type { Metadata } from "next";
import { getTimelineEvents } from "@/lib/queries";
import { TimelineView } from "@/components/TimelineView";

export const metadata: Metadata = { title: "Timeline" };
/** ISR — data changes at most once per pipeline run; revalidated on a timer
 *  and on demand via /api/revalidate after each run (ARCHITECTURE §7.2). */
export const revalidate = 300;

export default async function TimelinePage() {
  const events = await getTimelineEvents();
  return (
    <div className="space-y-6">
      <header className="rise max-w-2xl">
        <div className="kicker">Chronology</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          The sequence of events
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Trades, public statements, and official actions on parallel tracks. What was said and
          done before and after a trade is the heart of the conflict-of-interest question —
          scroll through time and click any marker to read it.
        </p>
      </header>
      <TimelineView events={events} />
    </div>
  );
}
