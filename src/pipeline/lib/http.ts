/**
 * Polite HTTP client for the ingestion pipeline.
 *
 * Every external source is rate-limited per host, identified with a
 * descriptive User-Agent + contact email, and retried on transient failure.
 * This is both good citizenship and a legal requirement for SEC EDGAR.
 */
const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  "trump-stock-tracker civic-transparency project (contact: benjamin@opencivics.co)";

/** Minimum milliseconds between requests to the same host. */
const HOST_MIN_INTERVAL_MS = 2_000;
const lastHit = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strip credential-bearing query parameters before a URL reaches any error
 * message or log line. Pipeline errors are persisted to `ingestion_runs` and
 * printed to GitHub Actions logs — which are world-readable on a public repo —
 * so a raw failing URL would publish the API key it carries.
 */
export function redactUrl(s: string): string {
  return s.replace(/([?&](?:api_?key|apikey|token|key|access_token)=)[^&\s"']+/gi, "$1***");
}

async function throttle(url: string): Promise<void> {
  const host = new URL(url).host;
  const last = lastHit.get(host) ?? 0;
  const wait = last + HOST_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
  accept?: string;
  /** Override the User-Agent (e.g. APIs that reject non-browser agents). */
  userAgent?: string;
}

/** Fetch with throttling, retries, and a descriptive User-Agent. */
export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { retries = 3, timeoutMs = 60_000, accept, userAgent } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: {
          "User-Agent": userAgent ?? USER_AGENT,
          ...(accept ? { Accept: accept } : {}),
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${redactUrl(url)}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2_000 * (attempt + 1));
    }
  }
  throw new Error(
    `politeFetch failed after ${retries + 1} attempts for ${redactUrl(url)}: ${redactUrl(String(lastErr))}`,
  );
}

/** Fetch JSON from a polite request. */
export async function fetchJson<T = unknown>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await politeFetch(url, { accept: "application/json", ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching JSON from ${redactUrl(url)}`);
  return (await res.json()) as T;
}

/** Fetch text from a polite request. */
export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching text from ${redactUrl(url)}`);
  return res.text();
}

/** Fetch raw bytes (for PDFs). */
export async function fetchBytes(url: string, opts?: FetchOptions): Promise<Buffer> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching bytes from ${redactUrl(url)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** POST JSON, same throttling/retry/identification as politeFetch. */
export async function fetchJsonPost<T = unknown>(
  url: string,
  body: unknown,
  opts: FetchOptions = {},
): Promise<T> {
  const { retries = 3, timeoutMs = 60_000, userAgent } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": userAgent ?? USER_AGENT,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${redactUrl(url)}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} posting to ${redactUrl(url)}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2_000 * (attempt + 1));
    }
  }
  throw new Error(
    `fetchJsonPost failed after ${retries + 1} attempts for ${redactUrl(url)}: ${redactUrl(String(lastErr))}`,
  );
}
