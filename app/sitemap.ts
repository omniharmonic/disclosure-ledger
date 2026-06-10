import type { MetadataRoute } from "next";
import { listCompanies, listFilings } from "@/lib/queries";

export const revalidate = 3600;

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trumpstocktracker.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    "",
    "/trades",
    "/companies",
    "/timeline",
    "/graph",
    "/filings",
    "/methodology",
    "/api-docs",
  ].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: path === "" || path === "/trades" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  // Dynamic pages — companies and filings are the durable, linkable entities.
  try {
    const [companies, filings] = await Promise.all([listCompanies(), listFilings()]);
    fixed.push(
      ...companies
        .filter((c) => c.ticker)
        .map((c) => ({
          url: `${BASE}/companies/${encodeURIComponent(c.ticker!)}`,
          changeFrequency: "daily" as const,
          priority: 0.8,
        })),
      ...filings.map((f) => ({
        url: `${BASE}/filings/${f.id}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    );
  } catch {
    // DB unavailable at build — ship the static routes; ISR fills in later.
  }
  return fixed;
}
