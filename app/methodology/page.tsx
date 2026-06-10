import type { Metadata } from "next";
import { AMOUNT_BANDS } from "@/lib/bands";
import {
  WEIGHTS,
  COMPONENT_DEFINITIONS,
  SCORING_CHANGELOG,
  SCORING_VERSION,
  type ComponentName,
} from "@/lib/scoring";

const COMPONENT_NAMES: Record<ComponentName, string> = {
  temporalProximity: "Temporal proximity",
  entitySpecificity: "Entity specificity",
  authority: "Authority",
  tradeMagnitude: "Trade magnitude",
  corroboration: "Corroboration",
};

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Trump Stock Tracker sources, extracts, validates, and presents presidential financial-disclosure data.",
};

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-bold tracking-tight">{children}</h2>;
}

export default function MethodologyPage() {
  return (
    <article className="max-w-3xl space-y-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
      <p className="text-[var(--color-muted)]">
        This page documents — in full — where the data comes from, how it is extracted and
        validated, and the editorial rules that govern how it is presented. The methodology is
        public and versioned; material changes are recorded here.
      </p>

      <H>What this is</H>
      <p>
        Trump Stock Tracker is a civic-transparency project. It compiles the President&rsquo;s
        securities transactions as disclosed under the <strong>Ethics in Government Act of
        1978</strong> and the <strong>STOCK Act of 2012</strong>, and correlates them with his
        public statements and official government actions. It is a transparency tool — not
        financial advice, and not a legal determination of wrongdoing.
      </p>

      <H>The OGE Form 278-T</H>
      <p>
        Federal officials disclose securities transactions on <strong>OGE Form 278-T</strong>
        {" "}(Periodic Transaction Report), filed within 30 days of notification and no later
        than 45 days after the transaction. Each filing lists transactions with a description,
        a type (Purchase, Sale, Sale (Partial), or Exchange), a date, a late-notification flag,
        and an amount — reported as a <strong>statutory range</strong>, never an exact figure.
      </p>

      <H>Amount bands</H>
      <p>
        The form never reports a precise dollar amount. It uses these statutory value ranges.
        This site always displays the range; aggregate &ldquo;estimated value&rdquo; figures
        use band midpoints and are themselves shown as ranges.
      </p>
      <table className="my-2 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--color-rule)] text-left text-[var(--color-muted)]">
            <th className="py-1 pr-4 font-medium">Band</th>
            <th className="py-1 font-medium">Range</th>
          </tr>
        </thead>
        <tbody>
          {AMOUNT_BANDS.map((b) => (
            <tr key={b.band} className="border-b border-[var(--color-rule)] last:border-0">
              <td className="py-1 pr-4 tabular">{b.band}</td>
              <td className="py-1">{b.label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H>Data sources</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Trades:</strong> the U.S. Office of Government Ethics (OGE) presidential
          disclosure system, and the White House disclosures pages. OGE is the source of
          record.
        </li>
        <li>
          <strong>Statements:</strong> the American Presidency Project and the federal
          Compilation of Presidential Documents (single-speaker official transcripts), plus
          Truth Social posts.
        </li>
        <li>
          <strong>Official actions:</strong> the Federal Register API (executive orders,
          proclamations, rules) and White House fact sheets, articles, and statements scraped
          from whitehouse.gov.
        </li>
        <li>
          <strong>Share prices:</strong> weekly end-of-day price history from Alpha Vantage
          and current quotes from Finnhub, used to chart each company and mark the
          President&rsquo;s disclosed trades. Prices are non-blocking enrichment — never part
          of the disclosure record itself.
        </li>
      </ul>

      <H>Extraction &amp; validation</H>
      <p>
        The 278-T filings are scanned documents; some carry a poor embedded OCR text layer and
        the newest carry none at all. A content-anchored extractor locates each transaction by
        its recognizable amount band and date rather than by fragile column geometry. Every
        filing then passes a validation gate — page-count reconciliation, transaction-type and
        amount-band enum checks, and date sanity. Each filing receives a{" "}
        <strong>parse-confidence</strong> score; filings below threshold are withheld from the
        public view and held for human review rather than published unverified. Where a filing
        scores low, an LLM adjudicator re-reads the source PDF under a strict schema.
      </p>

      <H>Timing correlations — scoring model v{SCORING_VERSION}</H>
      <p>
        Each trade is scored against contemporaneous statements and official actions found in
        an asymmetric window (45 days before to 30 days after the transaction date). An event
        qualifies as a candidate when it names the traded company directly, or when it
        addresses the company&rsquo;s sub-industry (e.g. &ldquo;semiconductors&rdquo; for a
        chip maker). The composite 0–100 signal is a weighted sum of the components below —
        the exact weights the engine uses, rendered from the same source file. Every
        correlation displays its full component breakdown. The score is an analytical index,
        never a verdict.
      </p>
      <table className="my-2 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--color-rule)] text-left text-[var(--color-muted)]">
            <th className="py-1 pr-4 font-medium">Component</th>
            <th className="py-1 pr-4 font-medium">Weight</th>
            <th className="py-1 font-medium">Definition</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(WEIGHTS) as ComponentName[]).map((k) => (
            <tr key={k} className="border-b border-[var(--color-rule)] last:border-0 align-top">
              <td className="py-1 pr-4 whitespace-nowrap font-medium">{COMPONENT_NAMES[k]}</td>
              <td className="py-1 pr-4 tabular">{WEIGHTS[k].toFixed(2)}</td>
              <td className="py-1 text-[var(--color-ink-soft)]">{COMPONENT_DEFINITIONS[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>What is deliberately not in the model (yet):</strong> directional
        consistency — whether the trade&rsquo;s direction aligns with an event&rsquo;s
        expected price impact — requires price-impact modelling that v1 does not perform, so
        it is excluded from the score rather than shown as a placeholder. Each correlation is
        additionally passed through a reasoning check that asks whether the matched text is
        genuinely about the company (and not a string coincidence like &ldquo;Southern
        Co&rdquo; vs. &ldquo;the southern border&rdquo;); pairs judged coincidental are
        removed from public view.
      </p>

      <H>Scoring changelog</H>
      <ul className="list-disc space-y-1 pl-5">
        {SCORING_CHANGELOG.map((c) => (
          <li key={c.version}>
            <strong>v{c.version}</strong> ({c.date}) — {c.change}
          </li>
        ))}
      </ul>

      <H>Editorial discipline</H>
      <p>
        This project publishes verifiable facts and transparently-scored correlations. It does
        not assert that any trade was illegal, nor that it used nonpublic information.{" "}
        <strong>
          No evidence presented here establishes that any trade used nonpublic information;
          correlation is not causation; lawful trading is lawful.
        </strong>{" "}
        Amount ranges are statutory bands, not exact figures. Transaction dates may precede
        filing dates by 30–45 days, and filings may be amended.
      </p>

      <H>Permitted use</H>
      <p>
        Disclosure data is used solely for news and transparency dissemination to the general
        public — the use expressly permitted under 5&nbsp;U.S.C. §&nbsp;13107(c). It is not
        used for credit-rating, solicitation, or any other commercial purpose.
      </p>

      <H>Attribution</H>
      <p>
        Project by Benjamin Life (@omniharmonic). Scoring methodology version{" "}
        {SCORING_VERSION} (see changelog above).
      </p>
    </article>
  );
}
