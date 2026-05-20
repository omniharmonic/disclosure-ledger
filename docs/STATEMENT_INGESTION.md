# Statement Ingestion Methodology & Runbook

*How Disclosure Ledger sources, attributes, and company-tags the President's
public statements — and the spec for the YouTube/video ingestion still to be
built. Written so a future ingestion agent can implement it without re-research.*

*Version 1.0 — May 2026*

---

## 1. Why this is the hard problem

Trades are scanned PDFs — mechanical to extract. Statements are the precision
risk: attributing words to the President that he did not say is the
highest-severity defect class. Two facts shape everything here:

1. **The White House removed verbatim transcripts** from whitehouse.gov in May
   2025 and deleted the archive. The canonical text record is now fragmented.
2. **Video mixes speakers.** A press gaggle or interview contains reporters,
   aides, and hosts. Naïve caption ingestion misattributes their words.

The design principle: **prefer sources where attribution is solved at the
source; treat everything else as provisional and flag it.**

---

## 2. Source waterfall (priority order)

| # | Source | Attribution | Status in v1 |
|---|---|---|---|
| 1 | **Truth Social** (@realDonaldTrump) | Certain — his own account, verbatim | ✅ Live (CNN-mirrored archive, no key) |
| 2 | **govinfo Compilation of Presidential Documents** | Certain — official single-speaker transcripts | ⬜ Spec'd — needs `DATA_GOV_API_KEY` |
| 3 | **American Presidency Project** (UCSB) | Certain — single-speaker remarks | ⬜ Spec'd — polite scrape |
| 4 | **YouTube** (canonical channels) | Needs speaker resolution | ⬜ This document specifies it |
| 5 | whitehouse.gov `/remarks/` | Discovery index only (no transcripts) | ⬜ Discovery feed |

Statements 1–3 are auto-trusted for correlation. Statement 4 (video) is
**provisional** until speaker-resolved (§5).

---

## 3. YouTube ingestion — channel strategy

The goal each day: find videos that are **mostly the President speaking** —
formal addresses, press conferences, and call-in interviews (he routinely
makes market-moving remarks on daytime talk shows he phones into).

### 3.1 Canonical channels to monitor

Resolve each handle → channel ID once (`channels.list?forHandle=`), cache it,
then page its uploads playlist daily (`playlistItems.list`, 1 quota unit per
50 videos — never use `search.list` at 100 units).

| Tier | Channels | Why |
|---|---|---|
| **A — Trump-only** | The White House (`@WhiteHouse`) | Official addresses; the President is the dominant or sole speaker. |
| **B — pool/news, high Trump density** | C-SPAN, Forbes Breaking News, Fox News, NBC News, PBS NewsHour | Reliably post full Trump speeches/pressers, often titled with his name. |
| **C — interview/call-in** | Fox & Friends, talk-show channels he calls into | The "drops a bombshell on a call-in" case — usually clipped within hours. |

Channel list lives in `src/pipeline/lib/youtube-channels.ts` (to be created) so
it is version-controlled and auditable.

### 3.2 Video-selection heuristics

A discovered video is a candidate if **any** of:

- Title matches `/\b(Trump|President)\b/i` AND `/(remarks|speech|address|press|interview|full|delivers|speaks)/i`.
- The video is on a Tier-A channel (assume Trump-dominant).
- Duration ≥ 3 minutes (filters out non-speech clips) AND title names Trump.

Exclude: titles with `/(analysis|reaction|panel|debate recap)/i` — these are
commentary *about* Trump, not him speaking.

Record every candidate's `videoId`, channel, title, publish date, and the
matched heuristic, so selection is auditable.

---

## 4. Getting the transcript (no audio processing by us)

**Constraint:** the official YouTube Data API `captions.download` works only
for videos the caller owns — it cannot fetch C-SPAN's or a news channel's
captions. Do **not** rely on it.

**Use a caption-retrieval service** — Supadata (`SUPADATA_API_KEY`, free tier)
— which returns a video's *already-published* caption track and absorbs the
cloud-IP blocking that breaks naïve scrapers. This platform performs **no ASR**:
we only retrieve transcripts that already exist.

Captions arrive as timed text segments: `[{ start, dur, text }]`.

---

## 5. Speaker resolution (the precision gate)

Raw captions have no speaker labels. Before any video-derived text is trusted:

1. **Tier-A (Trump-only) videos** — official addresses. Treat the whole
   transcript as the President with `attribution_method = 'caption_derived'`,
   `attribution_conf = 0.9`. Spot-check periodically.
2. **Tier-B/C (mixed) videos** — run a **text-only LLM speaker-segmentation
   pass** (no audio): send the timed transcript to Claude with a strict schema
   asking it to label each segment `TRUMP | OTHER | UNCERTAIN` using contextual
   cues (question vs. answer, "Mr. President", reporter framing). Keep only
   `TRUMP` segments; store `attribution_conf` = the model's per-segment
   confidence; anything `< 0.8` is flagged `needs_review = true` and excluded
   from auto-correlation.
3. Never auto-attribute an `UNCERTAIN` or `OTHER` segment.

The confidence rating must be **astute**: it is better to drop a real Trump
quote than to attribute a reporter's words to him. Misattribution is the
defect class that ends the project's credibility.

A future hardening step: enroll a Trump voiceprint and verify via speaker
embeddings — but that requires audio processing and is out of v1 scope.

---

## 6. Transcript-based company search (the second pass)

Once trades are known, the value is finding statements about *those companies*
— and a company reference lives in the transcript body, not the video title.

This is already implemented: `detect-mentions` runs the company gazetteer over
every statement's `full_text`, regardless of source. **As more statements are
ingested (YouTube transcripts especially), simply re-running `detect-mentions`
→ `correlate` → `graph-build` performs the company search automatically.** No
separate pass is needed — the pipeline is designed so new statements flow into
correlations on the next run.

The gazetteer's precision rules (`src/pipeline/stages/detect-mentions.ts`):
ticker match (≥ 3 chars, uppercase, stopword-filtered); single distinctive
name token (≥ 5 chars, not generic, not a weak solo token); multi-word names
matched as an adjacent phrase. The LLM mention layer (sentiment, stance, exact
quote spans) augments this once `ANTHROPIC_API_KEY` is set.

---

## 7. Cadence

| Stream | Cadence | Rationale |
|---|---|---|
| Trade filings (278-T) | Daily discovery poll | Filings need to be seen once; daily catches them within a day of posting. Late filings (beyond the 45-day window) are caught whenever they appear — discovery is idempotent. |
| Statements (Truth Social, YouTube, CPD) | Daily | Pull each day's new statements; far easier than periodic backfill. |
| Backfill | One-time | Historical Truth Social is already ingested; historical video backfill is optional and can run as a one-off `workflow_dispatch`. |

One daily GitHub Actions run (`pipeline.yml`) executes the whole pipeline.

---

## 8. Implementation checklist for the YouTube module

To build `src/pipeline/stages/ingest-youtube.ts`:

1. `src/pipeline/lib/youtube-channels.ts` — the curated channel list (§3.1).
2. Resolve handles → channel IDs (cache in `data/cache/youtube-channels.json`).
3. Page each channel's uploads playlist; apply §3.2 heuristics; dedupe by `videoId`.
4. For each new candidate: retrieve captions via Supadata (§4).
5. Speaker-resolve (§5): Tier-A direct; Tier-B/C via LLM segmentation.
6. Write `statements` rows — `source = 'youtube'`, `channel`, `source_ref = videoId`,
   `attribution_method`, `attribution_conf`, `needs_review`.
7. Add the stage to `run.ts` after `ingest-statements`.

Required keys: `YOUTUBE_API_KEY`, `SUPADATA_API_KEY`, `ANTHROPIC_API_KEY`.

---

## 9. Required API keys

| Key | Used for | Where to get it | Cost |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Parser adjudication, LLM mention extraction, speaker segmentation | console.anthropic.com | Pay-per-token (~$1–15/mo at this scale) |
| `DATA_GOV_API_KEY` | govinfo CPD + regulations.gov | api.data.gov/signup (instant, free) | Free |
| `YOUTUBE_API_KEY` | Video discovery (uploads playlists) | console.cloud.google.com → YouTube Data API v3 | Free (10k units/day) |
| `SUPADATA_API_KEY` | YouTube/C-SPAN caption retrieval | supadata.ai | Free tier to start |
| `TIINGO_API_KEY` | Historical stock prices (enrichment) | tiingo.com | Free tier |
| `FMP_API_KEY` | Price cross-check | financialmodelingprep.com | Free tier (250 calls/day) |

Set each as a **GitHub Actions secret** (for the pipeline) and a **Vercel
environment variable** (for any request-path use). The pipeline degrades
gracefully — every key-gated stage is a logged no-op when its key is absent.
