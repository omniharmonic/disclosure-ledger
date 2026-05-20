import type { Metadata } from "next";
import { getTimelineEvents } from "@/lib/queries";
import { TimelineView } from "@/components/TimelineView";

export const metadata: Metadata = { title: "Timeline" };
export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const events = await getTimelineEvents();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Trades, public statements, and official actions on parallel tracks. The sequence
          around any trade — what was said and done before and after — is the heart of the
          conflict-of-interest question.
        </p>
      </div>
      <TimelineView events={events} />
      <p className="text-xs text-[var(--color-muted)]">
        Showing the most recent events in each lane. Transaction dates may precede their filing
        date by 30–45 days.
      </p>
    </div>
  );
}
