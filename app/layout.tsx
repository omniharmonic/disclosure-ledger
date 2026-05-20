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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${splineSans.variable} ${jetBrains.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <SiteNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
