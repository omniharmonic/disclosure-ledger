import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { signPut, canonicalRequestFor } from "./object-storage";

const body = Buffer.from("%PDF-1.7 test bytes");
const fixed = {
  endpoint: "https://account.r2.cloudflarestorage.com",
  bucket: "disclosure-ledger",
  region: "auto",
  key: "pdfs/abc123.pdf",
  body,
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "SECRETEXAMPLE",
  contentType: "application/pdf",
  now: new Date("2026-06-10T12:00:00Z"),
};

describe("SigV4 PUT signing", () => {
  it("produces a spec-shaped Authorization header with correct scope", () => {
    const { headers } = signPut(fixed);
    expect(headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260610\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(headers["x-amz-date"]).toBe("20260610T120000Z");
    expect(headers["x-amz-content-sha256"]).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
  });

  it("is deterministic for identical inputs and key-sensitive", () => {
    const a = signPut(fixed).headers.Authorization;
    const b = signPut(fixed).headers.Authorization;
    expect(a).toBe(b);
    const c = signPut({ ...fixed, secretAccessKey: "DIFFERENT" }).headers.Authorization;
    expect(c).not.toBe(a);
  });

  it("targets the path-style bucket URL", () => {
    const { url } = signPut(fixed);
    expect(url).toBe(
      "https://account.r2.cloudflarestorage.com/disclosure-ledger/pdfs/abc123.pdf",
    );
  });

  it("canonical request matches the SigV4 specification layout", () => {
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const cr = canonicalRequestFor({
      bucket: fixed.bucket,
      key: fixed.key,
      host: "account.r2.cloudflarestorage.com",
      contentType: "application/pdf",
      payloadHash,
      amzDate: "20260610T120000Z",
    });
    const lines = cr.split("\n");
    expect(lines[0]).toBe("PUT");
    expect(lines[1]).toBe("/disclosure-ledger/pdfs/abc123.pdf");
    expect(lines[2]).toBe(""); // empty query string
    expect(lines.at(-2)).toBe("content-type;host;x-amz-content-sha256;x-amz-date");
    expect(lines.at(-1)).toBe(payloadHash);
  });
});
