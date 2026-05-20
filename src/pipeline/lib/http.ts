/**
 * Polite HTTP client for the ingestion pipeline.
 *
 * Every external source is rate-limited per host, identified with a
 * descriptive User-Agent + contact email, and retried on transient failure.
 * This is both good citizenship and a legal requirement for SEC EDGAR.
 */
const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  "disclosure-ledger civic-transparency project (contact: benjamin@opencivics.co)";

/** Minimum milliseconds between requests to the same host. */
const HOST_MIN_INTERVAL_MS = 2_000;
const lastHit = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
}

/** Fetch with throttling, retries, and a descriptive User-Agent. */
export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { retries = 3, timeoutMs = 60_000, accept } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...(accept ? { Accept: accept } : {}),
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2_000 * (attempt + 1));
    }
  }
  throw new Error(`politeFetch failed after ${retries + 1} attempts: ${String(lastErr)}`);
}

/** Fetch JSON from a polite request. */
export async function fetchJson<T = unknown>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await politeFetch(url, { accept: "application/json", ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching JSON from ${url}`);
  return (await res.json()) as T;
}

/** Fetch text from a polite request. */
export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching text from ${url}`);
  return res.text();
}

/** Fetch raw bytes (for PDFs). */
export async function fetchBytes(url: string, opts?: FetchOptions): Promise<Buffer> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching bytes from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
