import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: {
    default: "Disclosure Ledger — Presidential Conflict-of-Interest Tracker",
    template: "%s · Disclosure Ledger",
  },
  description:
    "A civic-transparency record of the President's disclosed stock trades, public statements, and official actions — with transparently-scored timing correlations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
