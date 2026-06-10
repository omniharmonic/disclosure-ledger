/**
 * Real-cryptography tests for PDF signature verification: a fixture file is
 * signed with an openssl-generated CMS detached signature (self-signed cert,
 * created at test time), embedded PDF-style (/ByteRange + zero-padded
 * /Contents hex window). Verifies the genuine file, then proves tampering is
 * detected. Skipped when openssl is unavailable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSignatures, verifyPdfSignature } from "./pdf-signature";

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const HEX_WINDOW = 8192; // reserved /Contents window (hex chars), zero-padded

/** Build a minimal PDF-shaped file whose signed ranges are CMS-signed. */
function buildSignedFixture(dir: string): Buffer {
  // self-signed signer cert
  const key = join(dir, "k.pem");
  const crt = join(dir, "c.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", crt,
    "-days", "2", "-nodes", "-subj", "/CN=Test OGE Certifying Official",
  ], { stdio: "pipe" });

  // Fixed-width (zero-padded) ByteRange numbers keep every offset stable
  // regardless of the eventual values — the same reserve-then-fill trick
  // real PDF signers use for the /Contents window.
  const pad = (n: number) => String(n).padStart(10, "0");
  const head =
    "%PDF-1.7\n1 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached\n/Contents <";
  const tailFor = (r: [number, number, number, number]) =>
    `> /ByteRange [${r.map(pad).join(" ")}]\n>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;

  const part1 = Buffer.from(head, "latin1");
  const part2Start = part1.length + HEX_WINDOW;
  const part2Len = tailFor([0, 0, 0, 0]).length; // widths fixed → length stable
  const part2 = Buffer.from(
    tailFor([0, part1.length, part2Start, part2Len]),
    "latin1",
  );
  if (part2.length !== part2Len) throw new Error("fixture: unstable part2 length");
  const signedPayload = Buffer.concat([part1, part2]);
  const payloadPath = join(dir, "payload.bin");
  writeFileSync(payloadPath, signedPayload);

  // Detached CMS over the payload.
  const sigPath = join(dir, "sig.der");
  execFileSync("openssl", [
    "cms", "-sign", "-binary", "-md", "sha256", "-outform", "DER",
    "-in", payloadPath, "-signer", crt, "-inkey", key, "-out", sigPath,
  ], { stdio: "pipe" });
  const sigHex = readFileSync(sigPath).toString("hex");
  if (sigHex.length > HEX_WINDOW) throw new Error("fixture: hex window too small");
  const hexPadded = sigHex.padEnd(HEX_WINDOW, "0");

  return Buffer.concat([part1, Buffer.from(hexPadded, "latin1"), part2]);
}

describe.runIf(hasOpenssl())("pdf signature verification", () => {
  let pdf: Buffer;

  beforeAll(() => {
    pdf = buildSignedFixture(mkdtempSync(join(tmpdir(), "sigtest-")));
  });

  it("extracts the signature dictionary (ByteRange + Contents)", () => {
    const sigs = extractSignatures(pdf);
    expect(sigs.length).toBe(1);
    expect(sigs[0].ranges[0]).toBe(0);
    expect(sigs[0].cmsDer.length).toBeGreaterThan(200);
  });

  it("verifies an untampered signed file and reads the signer CN", async () => {
    const res = await verifyPdfSignature(pdf);
    expect(res.present).toBe(true);
    expect(res.verified).toBe(true);
    expect(res.signer).toBe("Test OGE Certifying Official");
  });

  it("detects tampering — a single flipped byte in the signed range fails", async () => {
    const tampered = Buffer.from(pdf);
    tampered[20] = tampered[20] === 0x41 ? 0x42 : 0x41; // inside part 1
    const res = await verifyPdfSignature(tampered);
    expect(res.present).toBe(true);
    expect(res.verified).toBe(false);
  });

  it("returns not-present for unsigned bytes", async () => {
    const res = await verifyPdfSignature(Buffer.from("%PDF-1.7 nothing here"));
    expect(res.present).toBe(false);
    expect(res.verified).toBeNull();
  });
});
