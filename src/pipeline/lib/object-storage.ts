/**
 * Durable provenance storage (W-9) — S3-compatible object PUT with AWS
 * Signature V4, implemented on node:crypto (no SDK dependency for one verb).
 *
 * Works with any S3-compatible store; Cloudflare R2's free tier (10 GB) fits
 * the project's $0 budget. Configure:
 *
 *   PDF_ARCHIVE_ENDPOINT     https://<account>.r2.cloudflarestorage.com
 *   PDF_ARCHIVE_BUCKET       disclosure-ledger
 *   PDF_ARCHIVE_REGION       auto            (R2) / us-east-1 (S3)
 *   PDF_ARCHIVE_ACCESS_KEY_ID / PDF_ARCHIVE_SECRET_ACCESS_KEY
 *   PDF_ARCHIVE_PUBLIC_BASE  https://pub-….r2.dev   (public read base URL)
 *
 * Without configuration every call is a logged no-op — the GitHub Actions
 * cache + artifact copies remain the fallback provenance homes.
 */
import { createHash, createHmac } from "node:crypto";

const sha256hex = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

export interface SigV4Parts {
  url: string;
  headers: Record<string, string>;
}

/**
 * Build a SigV4-signed PUT request (pure — unit-testable without a network).
 */
export function signPut(opts: {
  endpoint: string;
  bucket: string;
  region: string;
  key: string;
  body: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  contentType: string;
  now?: Date;
}): SigV4Parts {
  const { endpoint, bucket, region, key, body, accessKeyId, secretAccessKey, contentType } = opts;
  const now = opts.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(endpoint).host;
  const canonicalUri = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const payloadHash = sha256hex(body);

  const headers: Record<string, string> = {
    host,
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    url: `${endpoint.replace(/\/$/, "")}${canonicalUri}`,
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Exported for tests — the canonical request string for given inputs. */
export function canonicalRequestFor(opts: {
  bucket: string;
  key: string;
  host: string;
  contentType: string;
  payloadHash: string;
  amzDate: string;
}): string {
  const canonicalUri = `/${opts.bucket}/${opts.key.split("/").map(encodeURIComponent).join("/")}`;
  const headers = [
    `content-type:${opts.contentType}`,
    `host:${opts.host}`,
    `x-amz-content-sha256:${opts.payloadHash}`,
    `x-amz-date:${opts.amzDate}`,
  ].join("\n");
  return [
    "PUT",
    canonicalUri,
    "",
    headers + "\n",
    "content-type;host;x-amz-content-sha256;x-amz-date",
    opts.payloadHash,
  ].join("\n");
}

function config() {
  const endpoint = process.env.PDF_ARCHIVE_ENDPOINT;
  const bucket = process.env.PDF_ARCHIVE_BUCKET;
  const accessKeyId = process.env.PDF_ARCHIVE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.PDF_ARCHIVE_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.PDF_ARCHIVE_REGION ?? "auto",
    publicBase: process.env.PDF_ARCHIVE_PUBLIC_BASE ?? null,
  };
}

/**
 * Mirror a raw filing PDF to durable storage. Returns the public URL (or the
 * bucket URL when no public base is configured), or null when unconfigured /
 * failed — archiving never blocks ingestion.
 */
export async function archivePdf(hash: string, bytes: Buffer): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;

  const key = `pdfs/${hash}.pdf`;
  try {
    const { url, headers } = signPut({
      endpoint: cfg.endpoint,
      bucket: cfg.bucket,
      region: cfg.region,
      key,
      body: bytes,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      contentType: "application/pdf",
    });
    const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(bytes) });
    if (!res.ok) {
      console.error(`[archive] PUT ${key} failed: HTTP ${res.status}`);
      return null;
    }
    const publicUrl = cfg.publicBase
      ? `${cfg.publicBase.replace(/\/$/, "")}/${key}`
      : url;
    console.log(`[archive] mirrored ${key}`);
    return publicUrl;
  } catch (err) {
    console.error(`[archive] ${key}: ${String(err)}`);
    return null;
  }
}
