/**
 * API-key authentication + per-subject daily rate limiting (FR-API2).
 *
 * Keys are looked up by SHA-256 hash (`api_keys.key_hash` — raw keys are
 * never stored). Anonymous callers are limited per hashed client IP. Counters
 * live in `api_usage`, incremented atomically — the single serving-tier
 * write, so a production deployment can scope the web role's write grants to
 * that one table (everything else reads via the read-only client).
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, apiUsage } from "@/db/schema";

/** Requests/day for callers without an API key. */
export const ANONYMOUS_DAILY_LIMIT = 500;
/** Default requests/day for keyed callers (overridable per key). */
export const DEFAULT_KEY_DAILY_LIMIT = 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface RateGate {
  /** Non-null = request must be rejected with this response. */
  rejection: NextResponse | null;
  /** Echoed on successful responses. */
  headers: Record<string, string>;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Identify the caller, count the request, and decide whether to serve it.
 * Fails open on infrastructure errors — a rate-limit outage must not take
 * the public dataset down with it.
 */
export async function enforceRateLimit(req: NextRequest): Promise<RateGate> {
  let subject: string;
  let limit: number;

  const rawKey = req.headers.get("x-api-key");
  if (rawKey) {
    const keyHash = sha256(rawKey);
    const [key] = await db
      .select({
        id: apiKeys.id,
        rateLimit: apiKeys.rateLimit,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(sql`${apiKeys.keyHash} = ${keyHash}`)
      .limit(1);
    if (!key || key.revokedAt) {
      return {
        rejection: NextResponse.json(
          { error: "invalid or revoked API key" },
          { status: 401 },
        ),
        headers: {},
      };
    }
    subject = `key:${key.id}`;
    limit = key.rateLimit ?? DEFAULT_KEY_DAILY_LIMIT;
  } else {
    subject = `ip:${sha256(clientIp(req)).slice(0, 32)}`;
    limit = ANONYMOUS_DAILY_LIMIT;
  }

  const day = new Date().toISOString().slice(0, 10);
  let used = 0;
  try {
    const [row] = await db
      .insert(apiUsage)
      .values({ subject, day, count: 1 })
      .onConflictDoUpdate({
        target: [apiUsage.subject, apiUsage.day],
        set: { count: sql`${apiUsage.count} + 1` },
      })
      .returning({ count: apiUsage.count });
    used = row?.count ?? 1;
  } catch (err) {
    console.error("[ratelimit] counter unavailable, failing open:", err);
    return { rejection: null, headers: {} };
  }

  const remaining = Math.max(0, limit - used);
  const headers = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": `${day}T23:59:59Z`,
  };

  if (used > limit) {
    return {
      rejection: NextResponse.json(
        {
          error: rawKey
            ? "daily rate limit exceeded for this API key"
            : `anonymous daily limit (${ANONYMOUS_DAILY_LIMIT}/day) exceeded — request an API key for higher limits`,
        },
        { status: 429, headers },
      ),
      headers,
    };
  }
  return { rejection: null, headers };
}
