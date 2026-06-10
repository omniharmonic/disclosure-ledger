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

export const SCORING_VERSION = "1.1";

/**
 * v1.1 — every weighted component genuinely varies. Directional consistency
 * (trade direction vs. expected price impact) is NOT in the active model: in
 * v1.0 it was a hardcoded 0.5 placeholder, which rendered as a flat
 * half-marks bar on every correlation card and implied analysis that did not
 * occur. It returns as a scored component when price-impact direction
 * modelling lands.
 */
export const WEIGHTS = {
  temporalProximity: 0.35,
  entitySpecificity: 0.25,
  authority: 0.15,
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
  tradeMagnitude:
    "Log-normalized midpoint of the disclosed amount band, 0..1 — a $5M trade signals more than a $15K one.",
  corroboration:
    "Bonus when several independent events cluster in the same window: (events − 1) × 0.25, capped at 1.",
};

export const SCORING_CHANGELOG: readonly { version: string; date: string; change: string }[] = [
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

/** Composite 0–100 signal, one decimal. */
export function score(c: ScoreComponents): number {
  let s = 0;
  for (const k of Object.keys(WEIGHTS) as ComponentName[]) s += WEIGHTS[k] * c[k];
  return Math.round(s * 1000) / 10;
}
