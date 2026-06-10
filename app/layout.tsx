import type { Metadata } from "next";
import { Space_Mono, Spline_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

// Headline face — a retro-technical monospace; the body stays a clean sans,
// data is set in a second monospace. The pairing reads as a tracking terminal.
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});
const splineSans = Spline_Sans({
  subsets: ["latin"],
  variable: "--font-spline",
  display: "swap",
});
const jetBrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://trumpstocktracker.com"),
  title: {
    default: "Trump Stock Tracker — Presidential Trades & Conflicts of Interest",
    template: "%s · Trump Stock Tracker",
  },
  description:
    "Every stock trade President Trump has disclosed, set beside his public statements and official actions — with transparently-scored timing correlations.",
  openGraph: {
    title: "Trump Stock Tracker",
    description:
      "Presidential stock-trade disclosures, public statements, and official actions — with transparently-scored timing correlations.",
    type: "website",
  },
};

/** Structured data: the site is, at heart, a public dataset (SEO, plan 4.10). */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Trump Stock Tracker — Presidential Securities Disclosures",
  description:
    "Structured record of the President's disclosed securities transactions (OGE Form 278-T), public statements, official government actions, and transparently-scored timing correlations. Amounts are statutory ranges; correlations are analytical indices, never findings of wrongdoing.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://trumpstocktracker.com",
  license: "https://opensource.org/license/mit",
  isAccessibleForFree: true,
  creator: { "@type": "Organization", name: "OpenCivics" },
  distribution: [
    {
      "@type": "DataDownload",
      encodingFormat: "application/x-ndjson",
      contentUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://trumpstocktracker.com"}/api/v1/export/transactions.ndjson`,
    },
    {
      "@type": "DataDownload",
      encodingFormat: "text/csv",
      contentUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://trumpstocktracker.com"}/api/v1/export/transactions.csv`,
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${splineSans.variable} ${jetBrains.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-[var(--color-ink)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--color-paper)]"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </body>
    </html>
  );
}
