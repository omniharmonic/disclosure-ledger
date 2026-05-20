import type { Metadata } from "next";
import { AMOUNT_BANDS } from "@/lib/bands";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Disclosure Ledger sources, extracts, validates, and presents presidential financial-disclosure data.",
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
        Disclosure Ledger is a civic-transparency project. It compiles the President&rsquo;s
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
          proclamations, rules) and USAspending.gov (federal contract awards).
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

      <H>Timing correlations</H>
      <p>
        Each trade is scored for timing correlation against contemporaneous statements and
        official actions using a transparent, multi-component model (temporal proximity,
        entity specificity, authority, directional consistency, trade magnitude, and
        corroboration). Every correlation displays its full component breakdown. The score is
        an analytical index, never a verdict.
      </p>

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
      <p>Project by Benjamin Life (@omniharmonic) · OpenCivics. Methodology version 1.0.</p>
    </article>
  );
}
