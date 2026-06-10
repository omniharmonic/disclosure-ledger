/**
 * Shared statement-attribution discipline (FR-S3, FR-S6).
 *
 * Speaker-safety classification: single-speaker document categories are safe
 * to auto-attribute; multi-speaker categories (interviews, news conferences,
 * exchanges with reporters) mix the President's words with others' and are
 * deferred to the speaker-segmentation layer rather than risk misattribution
 * — the highest-severity defect class.
 *
 * Similarity matching: the same event is often published by a fast source
 * (APP, White House) and later by the authoritative CPD. `statementsLikelySame`
 * decides whether two records describe the same utterance so the faster copy
 * can be superseded by the official text (FR-S6).
 */

/** Single-speaker title prefixes safe to auto-attribute. */
export const SINGLE_SPEAKER =
  /^(remarks|address|statement|message|commencement|inaugural|letter)/i;

/** Multi-speaker categories deferred to the speaker-segmentation layer. */
export const MULTI_SPEAKER =
  /(news conference|press conference|interview|exchange with reporters|question-and-answer|town hall|debate|gaggle)/i;

/** Is this document title safe to auto-attribute to a single speaker? */
export function isSingleSpeakerTitle(title: string): boolean {
  return SINGLE_SPEAKER.test(title.trim()) && !MULTI_SPEAKER.test(title);
}

function normWords(s: string, take: number): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, take);
}

/** Dice coefficient over word bigrams — robust to small edits/prefixes. */
export function textSimilarity(a: string, b: string, take = 120): number {
  const wa = normWords(a, take);
  const wb = normWords(b, take);
  if (wa.length < 4 || wb.length < 4) return 0;
  const bigrams = (w: string[]) => {
    const s = new Set<string>();
    for (let i = 0; i < w.length - 1; i++) s.add(`${w[i]} ${w[i + 1]}`);
    return s;
  };
  const sa = bigrams(wa);
  const sb = bigrams(wb);
  let common = 0;
  for (const g of sa) if (sb.has(g)) common++;
  return (2 * common) / (sa.size + sb.size);
}

export interface StatementLike {
  spokenAt: string;
  fullText: string;
  venue?: string | null;
}

/**
 * Do two statement records describe the same utterance? Same calendar day
 * AND either near-identical opening text or matching venue/title. Tuned for
 * precision: superseding the wrong record hides a real statement.
 */
export function statementsLikelySame(a: StatementLike, b: StatementLike): boolean {
  if (a.spokenAt !== b.spokenAt) return false;
  if (textSimilarity(a.fullText, b.fullText) >= 0.55) return true;
  if (a.venue && b.venue && textSimilarity(a.venue, b.venue, 30) >= 0.8) {
    return textSimilarity(a.fullText, b.fullText) >= 0.3;
  }
  return false;
}
