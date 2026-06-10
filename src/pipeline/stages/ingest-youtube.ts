/**
 * Stage 4d — Ingest video-only events via existing captions
 * (STATEMENT_INGESTION.md; FR-S1 priority 5, FR-S3).
 *
 * Coverage extension for events that exist only on video (call-in
 * interviews, pressers): discover candidate videos on curated channels via
 * the YouTube Data API (uploads playlists — 1 quota unit, never search.list
 * at 100), retrieve each video's *already-published* caption track via
 * Supadata (NO audio processing / ASR is performed by this platform), and
 * attribute spans:
 *
 *   Tier A (official, Trump-dominant): whole transcript →
 *     attribution_method = caption_derived, confidence 0.9.
 *   Tier B (mixed-speaker news pool): a text-only LLM speaker-segmentation
 *     pass labels each segment TRUMP | OTHER | UNCERTAIN; only TRUMP spans
 *     ≥ 0.8 confidence are kept. Without ANTHROPIC_API_KEY tier-B videos are
 *     skipped entirely — never attributed unsegmented.
 *
 * Statements below the confidence gate are stored with needs_review = true;
 * the correlation engine only trusts official transcripts and high-confidence
 * caption-derived spans (FR-S3 — enforced in correlate.ts).
 *
 * Keys: YOUTUBE_API_KEY + SUPADATA_API_KEY required (logged no-op without);
 * ANTHROPIC_API_KEY enables tier-B segmentation.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/db";
import { statements } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { fetchJson } from "../lib/http";
import { ensurePresident } from "../lib/persons";
import {
  YOUTUBE_CHANNELS,
  videoSelectionRule,
  parseIsoDuration,
  type ChannelTier,
} from "../lib/youtube-channels";

const YT_API = "https://www.googleapis.com/youtube/v3";
const SUPADATA_API = "https://api.supadata.ai/v1/youtube/transcript";
const CACHE_DIR = join(process.cwd(), "data", "cache");
const SEGMENTATION_MODEL = "claude-sonnet-4-6";
/** Tier-B spans below this speaker-attribution confidence are review-only. */
const ATTRIBUTION_GATE = 0.8;
/** Videos per channel per run. */
const PER_CHANNEL = 25;

export interface CaptionSegment {
  text: string;
  /** seconds from video start */
  start: number;
}

/** Normalize the several caption shapes Supadata-style APIs return. */
export function normalizeSegments(raw: unknown): CaptionSegment[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null
      ? ((raw as Record<string, unknown>).content ??
        (raw as Record<string, unknown>).transcript ??
        (raw as Record<string, unknown>).segments)
      : null;
  if (!Array.isArray(arr)) return [];
  const out: CaptionSegment[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    const startRaw = o.offset ?? o.start ?? o.startTime ?? 0;
    let start = Number(startRaw) || 0;
    if (start > 100_000) start = start / 1000; // ms → s
    out.push({ text, start });
  }
  return out;
}

export interface SegmentLabel {
  index: number;
  speaker: "TRUMP" | "OTHER" | "UNCERTAIN";
  confidence: number;
}

/**
 * Apply segmentation labels: keep TRUMP spans, splitting on the gate.
 * Pure — unit-tested.
 */
export function applySegmentation(
  segments: CaptionSegment[],
  labels: SegmentLabel[],
): { trusted: string; review: string; minTrustedConf: number } {
  const byIndex = new Map(labels.map((l) => [l.index, l]));
  const trusted: string[] = [];
  const review: string[] = [];
  let minTrustedConf = 1;
  segments.forEach((seg, i) => {
    const label = byIndex.get(i);
    if (!label || label.speaker !== "TRUMP") return; // never attribute OTHER/UNCERTAIN
    if (label.confidence >= ATTRIBUTION_GATE) {
      trusted.push(seg.text);
      minTrustedConf = Math.min(minTrustedConf, label.confidence);
    } else {
      review.push(seg.text);
    }
  });
  return {
    trusted: trusted.join(" "),
    review: review.join(" "),
    minTrustedConf: trusted.length ? minTrustedConf : 0,
  };
}

const SEGMENT_TOOL = {
  name: "label_segments",
  description: "Label the speaker of every numbered caption segment.",
  input_schema: {
    type: "object" as const,
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            speaker: { type: "string", enum: ["TRUMP", "OTHER", "UNCERTAIN"] },
            confidence: { type: "number", description: "0..1 speaker-attribution confidence" },
          },
          required: ["index", "speaker", "confidence"],
        },
      },
    },
    required: ["labels"],
  },
};

async function segmentWithLlm(segments: CaptionSegment[]): Promise<SegmentLabel[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const numbered = segments
    .slice(0, 400)
    .map((s, i) => `[${i}] ${s.text}`)
    .join("\n");
  const res = await client.messages.create({
    model: SEGMENTATION_MODEL,
    max_tokens: 8000,
    tools: [SEGMENT_TOOL],
    tool_choice: { type: "tool", name: "label_segments" },
    messages: [
      {
        role: "user",
        content:
          `These are unlabeled caption segments from a news video that includes President ` +
          `Trump speaking, possibly mixed with reporters, hosts, or officials. Label EVERY ` +
          `segment's speaker using contextual cues (questions addressed "Mr. President", ` +
          `reporter framing, first-person policy statements, anchor intros). Be conservative: ` +
          `if you are not sure a segment is Trump speaking, label it UNCERTAIN — attributing ` +
          `someone else's words to him is the worst possible error. Call label_segments.\n\n` +
          numbered,
      },
    ],
  });
  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return null;
  return (tool.input as { labels: SegmentLabel[] }).labels ?? null;
}

interface ChannelIdCache {
  [handle: string]: string;
}

async function resolveChannelId(handle: string, key: string): Promise<string | null> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, "youtube-channels.json");
  let cache: ChannelIdCache = {};
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    /* first run */
  }
  if (cache[handle]) return cache[handle];
  const res = await fetchJson<{ items?: { id: string }[] }>(
    `${YT_API}/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`,
    { retries: 1, timeoutMs: 20_000 },
  );
  const id = res.items?.[0]?.id ?? null;
  if (id) {
    cache[handle] = id;
    await writeFile(cachePath, JSON.stringify(cache, null, 2));
  }
  return id;
}

export interface YoutubeResult {
  videosScanned: number;
  candidates: number;
  ingested: number;
  reviewOnly: number;
  skipped: number;
  errors: string[];
}

export async function ingestYoutube(): Promise<YoutubeResult> {
  const result: YoutubeResult = {
    videosScanned: 0,
    candidates: 0,
    ingested: 0,
    reviewOnly: 0,
    skipped: 0,
    errors: [],
  };

  const ytKey = process.env.YOUTUBE_API_KEY;
  const supaKey = process.env.SUPADATA_API_KEY;
  if (!ytKey || !supaKey) {
    console.log("[ingest-youtube] skipped — needs YOUTUBE_API_KEY + SUPADATA_API_KEY");
    return result;
  }
  const canSegment = Boolean(process.env.ANTHROPIC_API_KEY);
  const personId = await ensurePresident();

  for (const channel of YOUTUBE_CHANNELS) {
    let channelId: string | null;
    try {
      channelId = await resolveChannelId(channel.handle, ytKey);
    } catch (err) {
      result.errors.push(`${channel.handle}: ${String(err)}`);
      continue;
    }
    if (!channelId) {
      result.errors.push(`${channel.handle}: channel id not resolvable`);
      continue;
    }
    const uploadsId = channelId.replace(/^UC/, "UU");

    interface PlaylistResp {
      items?: {
        snippet?: { title?: string; publishedAt?: string };
        contentDetails?: { videoId?: string };
      }[];
    }
    let playlist: PlaylistResp;
    try {
      playlist = await fetchJson<PlaylistResp>(
        `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=${PER_CHANNEL}&key=${ytKey}`,
        { retries: 1, timeoutMs: 30_000 },
      );
    } catch (err) {
      result.errors.push(`${channel.handle} uploads: ${String(err)}`);
      continue;
    }

    const videos = (playlist.items ?? [])
      .map((i) => ({
        videoId: i.contentDetails?.videoId ?? "",
        title: i.snippet?.title ?? "",
        publishedAt: (i.snippet?.publishedAt ?? "").slice(0, 10),
      }))
      .filter((v) => v.videoId && v.publishedAt);
    result.videosScanned += videos.length;

    // Durations in one batched call (tier-B duration heuristic).
    const durations = new Map<string, number>();
    try {
      const ids = videos.map((v) => v.videoId).join(",");
      const vres = await fetchJson<{ items?: { id: string; contentDetails?: { duration?: string } }[] }>(
        `${YT_API}/videos?part=contentDetails&id=${ids}&key=${ytKey}`,
        { retries: 1, timeoutMs: 30_000 },
      );
      for (const item of vres.items ?? []) {
        const d = parseIsoDuration(item.contentDetails?.duration ?? "");
        if (d) durations.set(item.id, d);
      }
    } catch {
      /* durations are an optional heuristic input */
    }

    for (const video of videos) {
      const rule = videoSelectionRule(
        video.title,
        channel.tier as ChannelTier,
        durations.get(video.videoId) ?? null,
      );
      if (!rule) continue;
      result.candidates++;

      const contentHash = createHash("sha256").update(`yt:${video.videoId}`).digest("hex");
      const exists = await db
        .select({ id: statements.id })
        .from(statements)
        .where(eq(statements.contentHash, contentHash))
        .limit(1);
      if (exists.length > 0) {
        result.skipped++;
        continue;
      }
      if (channel.tier === "B" && !canSegment) {
        // Never attribute a mixed-speaker transcript without segmentation.
        result.skipped++;
        continue;
      }

      let segments: CaptionSegment[];
      try {
        const raw = await fetchJson<unknown>(
          `${SUPADATA_API}?videoId=${encodeURIComponent(video.videoId)}`,
          { retries: 1, timeoutMs: 45_000, headers: { "x-api-key": supaKey } },
        );
        segments = normalizeSegments(raw);
      } catch (err) {
        result.errors.push(`${video.videoId} captions: ${String(err)}`);
        continue;
      }
      if (segments.length < 5) {
        result.skipped++;
        continue;
      }

      try {
        if (channel.tier === "A") {
          const text = segments.map((s) => s.text).join(" ").slice(0, 60_000);
          await db
            .insert(statements)
            .values({
              personId,
              spokenAt: video.publishedAt,
              channel: "video",
              venue: `${channel.label}: ${video.title}`.slice(0, 200),
              fullText: text,
              source: "youtube",
              sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
              sourceRef: video.videoId,
              attributionMethod: "caption_derived",
              attributionConf: 0.9,
              contentHash,
            })
            .onConflictDoNothing({ target: statements.contentHash });
          result.ingested++;
        } else {
          const labels = await segmentWithLlm(segments);
          if (!labels) {
            result.skipped++;
            continue;
          }
          const { trusted, review, minTrustedConf } = applySegmentation(segments, labels);
          if (trusted.length >= 200) {
            await db
              .insert(statements)
              .values({
                personId,
                spokenAt: video.publishedAt,
                channel: "video",
                venue: `${channel.label}: ${video.title}`.slice(0, 200),
                fullText: trusted.slice(0, 60_000),
                source: "youtube",
                sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
                sourceRef: video.videoId,
                attributionMethod: "caption_derived",
                attributionConf: minTrustedConf,
                contentHash,
              })
              .onConflictDoNothing({ target: statements.contentHash });
            result.ingested++;
          } else if (review.length >= 200) {
            // Low-confidence spans: stored for the corpus, flagged, excluded
            // from auto-correlation by the FR-S3 gate.
            await db
              .insert(statements)
              .values({
                personId,
                spokenAt: video.publishedAt,
                channel: "video",
                venue: `${channel.label}: ${video.title}`.slice(0, 200),
                fullText: review.slice(0, 60_000),
                source: "youtube",
                sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
                sourceRef: video.videoId,
                attributionMethod: "caption_derived",
                attributionConf: 0.5,
                needsReview: true,
                contentHash,
              })
              .onConflictDoNothing({ target: statements.contentHash });
            result.reviewOnly++;
          } else {
            result.skipped++;
          }
        }
      } catch (err) {
        result.errors.push(`${video.videoId}: ${String(err)}`);
      }
    }
  }

  console.log(
    `[ingest-youtube] ${result.ingested} attributed, ${result.reviewOnly} review-only, ` +
      `${result.candidates} candidates of ${result.videosScanned} scanned`,
  );
  return result;
}

export async function youtubeCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(statements)
    .where(eq(statements.source, "youtube"));
  return Number(row?.n ?? 0);
}
