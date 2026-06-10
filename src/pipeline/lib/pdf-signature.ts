/**
 * PDF digital-signature verification (FR-T3).
 *
 * OGE filings carry an embedded PKCS#7/CMS signature from the certifying
 * official. This module performs real cryptographic verification:
 *
 *   1. locate the signature dictionary (/ByteRange + /Contents),
 *   2. reassemble the signed byte ranges,
 *   3. verify the CMS SignedData over them — message digest AND the
 *      signature over the signed attributes, against the embedded signer
 *      certificate (pkijs).
 *
 * Scope honesty: this proves *document integrity* (the bytes have not been
 * altered since signing) and *signer-certificate consistency*. It does NOT
 * validate the certificate chain to a trusted root — that requires a trust-
 * store policy decision and is recorded as out of scope in the result. The
 * UI copy must therefore say "integrity verified", never "identity verified".
 */
import { webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import { ContentInfo, SignedData, Certificate, CryptoEngine, setEngine } from "pkijs";

setEngine("node", new CryptoEngine({ name: "node", crypto: webcrypto as Crypto }));

export interface SignatureCheck {
  /** A signature structure exists in the file. */
  present: boolean;
  /**
   * true  = digest + signature cryptographically verified against the
   *         embedded certificate (integrity intact);
   * false = signature present but FAILED verification (altered bytes or
   *         invalid signature — a genuine red flag);
   * null  = present but could not be evaluated (unsupported structure) —
   *         recorded as unknown, never as verified.
   */
  verified: boolean | null;
  /** Subject CN of the embedded signing certificate, when readable. */
  signer: string | null;
  note?: string;
}

const NOT_PRESENT: SignatureCheck = { present: false, verified: null, signer: null };

interface ExtractedSig {
  ranges: [number, number, number, number];
  cmsDer: Buffer;
}

/**
 * Locate signature dictionaries: every /ByteRange [a b c d] with a /Contents
 * <hex> nearby. Tolerates whitespace/newlines inside the array and padded
 * hex (PDF signers reserve a fixed-size window and zero-pad).
 */
export function extractSignatures(bytes: Buffer): ExtractedSig[] {
  const text = bytes.toString("latin1");
  const out: ExtractedSig[] = [];
  const rangeRe = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  for (const m of text.matchAll(rangeRe)) {
    const ranges: [number, number, number, number] = [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
    ];
    // /Contents may precede or follow /ByteRange within the same dictionary;
    // search a window around the match.
    const windowStart = Math.max(0, (m.index ?? 0) - 40_000);
    const window = text.slice(windowStart, (m.index ?? 0) + 40_000);
    const contents = window.match(/\/Contents\s*<([0-9A-Fa-f\s]+)>/);
    if (!contents) continue;
    const hex = contents[1].replace(/\s+/g, "");
    if (hex.length < 64) continue;
    out.push({ ranges, cmsDer: Buffer.from(hex, "hex") });
  }
  return out;
}

function signedBytes(bytes: Buffer, r: [number, number, number, number]): Buffer {
  return Buffer.concat([
    bytes.subarray(r[0], r[0] + r[1]),
    bytes.subarray(r[2], r[2] + r[3]),
  ]);
}

function signerCn(sd: SignedData): string | null {
  const cert = sd.certificates?.[0];
  if (!cert || !(cert instanceof Certificate)) return null;
  const cn = cert.subject.typesAndValues.find((t) => t.type === "2.5.4.3");
  return cn ? String(cn.value.valueBlock.value) : null;
}

async function verifyOne(bytes: Buffer, sig: ExtractedSig): Promise<SignatureCheck> {
  const [a, b, c, d] = sig.ranges;
  if (a !== 0 || b <= 0 || c <= b || d < 0 || c + d > bytes.length) {
    return { present: true, verified: null, signer: null, note: "implausible ByteRange" };
  }
  let sd: SignedData;
  try {
    const asn = asn1js.fromBER(new Uint8Array(sig.cmsDer).buffer);
    if (asn.offset === -1) throw new Error("not BER/DER");
    const ci = new ContentInfo({ schema: asn.result });
    sd = new SignedData({ schema: ci.content });
  } catch (err) {
    return {
      present: true,
      verified: null,
      signer: null,
      note: `unparseable CMS: ${String(err).slice(0, 120)}`,
    };
  }
  const signer = signerCn(sd);
  try {
    const data = signedBytes(bytes, sig.ranges);
    const ok = await sd.verify({
      signer: 0,
      data: new Uint8Array(data).buffer,
      checkChain: false, // chain-to-root validation is explicitly out of scope
    });
    return {
      present: true,
      verified: ok === true,
      signer,
      note: ok === true ? "integrity verified (chain-to-root not validated)" : "verification failed",
    };
  } catch (err) {
    const msg = String(err);
    // pkijs throws on a bad digest in some paths — that IS a failed check.
    if (/digest|signature/i.test(msg)) {
      return { present: true, verified: false, signer, note: "verification failed" };
    }
    return {
      present: true,
      verified: null,
      signer,
      note: `could not evaluate: ${msg.slice(0, 120)}`,
    };
  }
}

/** Verify the first evaluable signature in the PDF. */
export async function verifyPdfSignature(bytes: Buffer): Promise<SignatureCheck> {
  const sigs = extractSignatures(bytes);
  if (sigs.length === 0) return NOT_PRESENT;
  let last: SignatureCheck = { present: true, verified: null, signer: null };
  for (const sig of sigs) {
    const res = await verifyOne(bytes, sig);
    if (res.verified !== null) return res; // definitive answer (true or false)
    last = res;
  }
  return last;
}
