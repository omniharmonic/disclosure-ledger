import type { NextConfig } from "next";

/**
 * Security headers (ARCHITECTURE §10). The CSP allows exactly what the app
 * uses: self-hosted scripts (plus Next's inline bootstrap), Google-hosted
 * fonts via next/font (self-hosted at build), canvas/data images, and no
 * framing. `unsafe-inline` styles are required by Recharts/force-graph
 * inline styling.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Compile-time validation of every <Link>/router.push target — all
    // routes now exist, so the deferral note that used to live here is done.
    typedRoutes: true,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
