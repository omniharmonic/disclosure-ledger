import type { Metadata } from "next";
import { Fraunces, Spline_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://disclosure-ledger.vercel.app"),
  title: {
    default: "Disclosure Ledger — Presidential Conflict-of-Interest Tracker",
    template: "%s · Disclosure Ledger",
  },
  description:
    "A civic-transparency record of the President's disclosed stock trades, public statements, and official actions — with transparently-scored timing correlations.",
  openGraph: {
    title: "Disclosure Ledger",
    description:
      "Presidential stock-trade disclosures, public statements, and official actions — with transparently-scored timing correlations.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${splineSans.variable} ${jetBrains.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <SiteNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
