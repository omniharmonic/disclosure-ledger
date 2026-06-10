/**
 * Correlation scoring — the "Potential Conflict Signal" model.
 *
 * Pure functions and published constants only (no DB imports) so the
 * methodology page renders the weights from the SAME source the engine uses,
 * and the model is unit-testable. Every change to weights or components bumps
 * SCORING_VERSION and gets a SCORING_CHANGELOG entry (PRD §8.6 — methodology
 * is public, versioned, and changelogged).
 */
import { bandMidpoint } from "./bands";

export const SCORING_VERSION = "1.2";

/**
 * v1.2 — directional consistency returns as a *real* component now that the
 * pipeline carries the signals it needs: statement sentiment toward the
 * company (LLM mention layer) and action type (a contract award is a
 * favorable act). Alignment unknown = 0.5 by definition (the PRD's own
 * scale: 1.0 aligned / 0.5 unknown / 0.0 opposite) — it varies wherever the
 * underlying sentiment/action data exists.
 */
export const WEIGHTS = {
  temporalProximity: 0.3,
  entitySpecificity: 0.25,
  authority: 0.1,
  directionalConsistency: 0.1,
  tradeMagnitude: 0.1,
  corroboration: 0.15,
} as const;

export type ComponentName = keyof typeof WEIGHTS;
export type ScoreComponents = Record<ComponentName, number>;

/** Plain-language definitions, rendered on the methodology page. */
export const COMPONENT_DEFINITIONS: Record<ComponentName, string> = {
  temporalProximity:
    "How close the statement/action is to the transaction date: exp(−|days|/14). Same-day = 1.0, two weeks ≈ 0.37.",
  entitySpecificity:
    "1.0 when the event names the traded company directly; 0.6 when it addresses the company's sub-industry (e.g. “semiconductors” for an NVIDIA trade).",
  authority:
    "The filer's policy power over the traded company — 1.0 for the President; recorded per filer so future filers (Cabinet, Congress) score lower.",
  directionalConsistency:
    "Whether the trade's direction aligns with the event's expected price impact: a purchase before favorable words/acts (or a sale before unfavorable ones) scores 1.0; the opposite pairing 0.0; alignment unknown 0.5. Statement direction comes from verified sentiment; a federal contract award counts as favorable.",
  tradeMagnitude:
    "Log-normalized midpoint of the disclosed amount band, 0..1 — a $5M trade signals more than a $15K one.",
  corroboration:
    "Bonus when several independent events cluster in the same window: (events − 1) × 0.25, capped at 1.",
};

export const SCORING_CHANGELOG: readonly { version: string; date: string; change: string }[] = [
  {
    version: "1.2",
    date: "June 2026",
    change:
      "Directional consistency reinstated as a real component (weight 0.10): trade direction vs. the event's expected price impact, derived from verified statement sentiment (LLM mention layer) and action type (contract awards count as favorable). Alignment unknown scores 0.5 by definition. Temporal proximity 0.35 → 0.30, authority 0.15 → 0.10.",
  },
  {
    version: "1.1",
    date: "June 2026",
    change:
      "Directional consistency removed from the active model (it was a constant 0.5 placeholder, not real analysis — it returns when price-impact direction modelling lands). Entity specificity now varies: direct issuer mention 1.0, sub-industry topic match 0.6. Authority is read from the filer record instead of being hardcoded. Weights renormalized.",
  },
  {
    version: "1.0",
    date: "May 2026",
    change: "Initial six-component model.",
  },
];

/** Decay constant for temporal proximity (days). */
export const TEMPORAL_TAU_DAYS = 14;

export function temporalProximity(gapDays: number): number {
  return Math.round(Math.exp(-Math.abs(gapDays) / TEMPORAL_TAU_DAYS) * 1000) / 1000;
}

/** Log-normalised band midpoint in [0,1]. */
export function magnitudeScore(band: number): number {
  const lo = Math.log(8_000);
  const hi = Math.log(50_000_000);
  const v = (Math.log(bandMidpoint(band)) - lo) / (hi - lo);
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}

/** Corroboration bonus for multiple independent in-window events. */
export function corroborationScore(eventCount: number): number {
  return Math.min(1, Math.max(0, (eventCount - 1) * 0.25));
}

/**
 * Directional consistency — does the trade's direction align with the
 * event's expected price impact? (PRD §6.2: 1.0 aligned / 0.5 unknown /
 * 0.0 opposite.)
 *
 *   • Statements: verified sentiment toward the company. Favorable words
 *     before a purchase (or unfavorable before a sale) align.
 *   • Actions: a federal contract award is favorable; other action types
 *     have no modelled direction yet → unknown.
 *   • Exchanges and unknown trade types have no direction → unknown.
 */
export function directionalScore(
  tradeType: string,
  eventKind: "statement" | "action",
  sentiment: string | null,
  actionType: string | null,
): number {
  const isBuy = tradeType.startsWith("Purchase");
  const isSell = tradeType.startsWith("Sale");
  if (!isBuy && !isSell) return 0.5;

  let impact: "positive" | "negative" | null = null;
  if (eventKind === "statement") {
    if (sentiment === "positive") impact = "positive";
    else if (sentiment === "negative") impact = "negative";
  } else if (actionType === "contract") {
    impact = "positive";
  }
  if (!impact) return 0.5;

  const aligned = (impact === "positive") === isBuy;
  return aligned ? 1 : 0;
}

/** Composite 0–100 signal, one decimal. */
export function score(c: ScoreComponents): number {
  let s = 0;
  for (const k of Object.keys(WEIGHTS) as ComponentName[]) s += WEIGHTS[k] * c[k];
  return Math.round(s * 1000) / 10;
}
