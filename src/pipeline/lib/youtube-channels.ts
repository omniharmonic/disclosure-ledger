/**
 * Curated YouTube channels monitored for presidential speech
 * (STATEMENT_INGESTION.md §3.1). Version-controlled so the selection is
 * auditable.
 *
 * Tier A — official channels where the President is the dominant or sole
 *          speaker: whole transcripts may be attributed (caption_derived,
 *          conf 0.9) without segmentation.
 * Tier B — pool/news channels that post full speeches and pressers: every
 *          transcript must pass LLM speaker segmentation before any span is
 *          attributed.
 */
export type ChannelTier = "A" | "B";

export interface YoutubeChannel {
  handle: string; // @handle, resolved to a channel id once and cached
  label: string;
  tier: ChannelTier;
}

export const YOUTUBE_CHANNELS: readonly YoutubeChannel[] = [
  { handle: "@WhiteHouse", label: "The White House", tier: "A" },
  { handle: "@CSPAN", label: "C-SPAN", tier: "B" },
  { handle: "@ForbesBreakingNews", label: "Forbes Breaking News", tier: "B" },
  { handle: "@FoxNews", label: "Fox News", tier: "B" },
  { handle: "@NBCNews", label: "NBC News", tier: "B" },
  { handle: "@PBSNewsHour", label: "PBS NewsHour", tier: "B" },
] as const;

/** Commentary-about-Trump videos — excluded (§3.2). */
const EXCLUDE_RE = /(analysis|reaction|panel|recap|opinion|highlights\s+and\s+analysis)/i;
const TRUMP_RE = /\b(trump|president)\b/i;
const SPEECH_RE = /(remarks|speech|address|press|presser|briefing|interview|full|delivers|speaks|news conference|signs|signing)/i;

/**
 * Video-selection heuristic (§3.2). Returns the matched rule (auditable) or
 * null when the video is not a candidate.
 */
export function videoSelectionRule(
  title: string,
  tier: ChannelTier,
  durationSec: number | null,
): string | null {
  if (EXCLUDE_RE.test(title)) return null;
  if (tier === "A") return "tier-A channel";
  if (TRUMP_RE.test(title) && SPEECH_RE.test(title)) return "title: Trump + speech term";
  if (durationSec != null && durationSec >= 180 && /\btrump\b/i.test(title)) {
    return "duration ≥ 3min + Trump in title";
  }
  return null;
}

/** Parse an ISO-8601 YouTube duration ("PT1H2M3S") to seconds. */
export function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) || null;
}
