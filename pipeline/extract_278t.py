#!/usr/bin/env python3
"""
OGE Form 278-T transaction extractor.

These filings are scanned documents. Some carry a poor embedded OCR text
layer; the newest carry none at all. Rather than rely on column geometry
(which messy OCR destroys), this extractor is *content-anchored*: the amount
band and the transaction date are recognizable even in degraded OCR, so each
transaction row is located by its amount band and the remaining fields are
assigned by content pattern.

Two subtleties this handles explicitly:
  * Municipal-bond descriptions contain maturity dates ("DUE 12/01/39"). Only
    dates within a plausible window around the filing date are accepted as the
    transaction date.
  * OCR row numbers are unreliable, so rows are numbered sequentially in
    document order; integrity is enforced downstream by page-count
    reconciliation and per-page counts rather than by trusting printed "#".

The extractor never writes to the database — it emits JSON on stdout; the Node
`parse` stage validates and persists it.

Usage:  python3 extract_278t.py <pdf_path> [filing_iso_date]
"""
import difflib
import json
import re
import sys

BANDS = [
    (1, "1001", 1_001, 15_000),
    (2, "15001", 15_001, 50_000),
    (3, "50001", 50_001, 100_000),
    (4, "100001", 100_001, 250_000),
    (5, "250001", 250_001, 500_000),
    (6, "500001", 500_001, 1_000_000),
    (7, "1000001", 1_000_001, 5_000_000),
    (8, "5000001", 5_000_001, 25_000_000),
    (9, "25000001", 25_000_001, 50_000_000),
    (10, "50000001", 50_000_001, None),
]
_BANDS_BY_LEN = sorted(BANDS, key=lambda b: -len(b[1]))

DATE_RE = re.compile(r"\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})\b")
AMOUNT_RE = re.compile(
    r"[\$Ss5]?\s?\d[\d,\. ]{2,}\s*[-•–—~]\s*[\$Ss5]?\s?\d[\d,\. ]{2,}"
)
OVER_RE = re.compile(r"[Oo0][vV][eE3]r\s+[\$Ss5]?\s?5[\d,\. ]{6,}")
PAGE_OF_RE = re.compile(r"Page\s*\d+\s*of\s*(\d+)", re.I)
# The 278-T column header ends "...Amount Received Over 30 Days Ago" (the
# notification column header wraps below the others). "Days Ago" is therefore
# the true end of the header block; OCR mangles "Days" to "Daya"/"Days.".
DAYS_AGO_RE = re.compile(r"Day[sa]\s*\.?\s*Ago", re.I)
AMOUNT_HDR_RE = re.compile(r"\bAmount\b", re.I)

TYPE_KEYWORDS = [
    ("Sale (Partial)", ["partial"]),
    ("Purchase", ["purchas", "ourcha", "outcha", "rchas", "urcha", "tchas", "tchan", "rchu"]),
    ("Sale", ["sale", "sold"]),
    ("Exchange", ["exchang", "xchang"]),
]


def resolve_band(text):
    """Resolve the first amount band in `text` -> (band_index, raw_match)."""
    cands = []
    am = AMOUNT_RE.search(text)
    over = OVER_RE.search(text)
    if am:
        cands.append((am.start(), am.group(0), "range"))
    if over:
        cands.append((over.start(), over.group(0), "over"))
    if not cands:
        return None
    cands.sort()
    _, raw, kind = cands[0]
    if kind == "over":
        return 10, raw.strip()
    lower = re.split(r"[-•–—~]", raw, 1)[0]
    digits = re.sub(r"[^0-9]", "", lower)
    for band, key, _lo, _hi in _BANDS_BY_LEN:
        if digits == key or digits.endswith(key):
            return band, raw.strip()
    return None


def classify_type(text):
    low = text.lower()
    for canonical, kws in TYPE_KEYWORDS:
        if any(k in low for k in kws):
            return canonical
    return None


# The Type column holds exactly one of four values. OCR garbles the word
# ("salo", "solo", "ourchaso") but it remains the token immediately before the
# transaction date, so a fuzzy edit-distance match against the four canonical
# words recovers most rows the keyword pass misses.
_CANON_TYPE = {
    "purchase": "Purchase",
    "sale": "Sale",
    "exchange": "Exchange",
    "partial": "Sale (Partial)",
}


def fuzzy_type(head):
    """Fuzzy-match the last word-token of `head` (the Type cell) to a type."""
    toks = re.findall(r"[A-Za-z][A-Za-z]{2,}", head)
    if not toks:
        return None
    best, best_ratio = None, 0.0
    # The last two tokens cover an OCR split of the type word.
    for tok in toks[-2:]:
        t = tok.lower()
        for key, canonical in _CANON_TYPE.items():
            r = difflib.SequenceMatcher(None, t, key).ratio()
            if r > best_ratio:
                best_ratio, best = r, canonical
    return best if best_ratio >= 0.5 else None


def normalize_date(m):
    mm, dd, yy = m.group(1), m.group(2), m.group(3)
    if len(yy) == 2:
        yy = "20" + yy
    try:
        mm_i, dd_i, yy_i = int(mm), int(dd), int(yy)
    except ValueError:
        return None
    if not (1 <= mm_i <= 12 and 1 <= dd_i <= 31 and 2000 <= yy_i <= 2100):
        return None
    return f"{yy_i:04d}-{mm_i:02d}-{dd_i:02d}"


def iter_amounts(text):
    """Yield non-overlapping amount-band matches in document order."""
    found = []
    for m in AMOUNT_RE.finditer(text):
        r = resolve_band(m.group(0))
        if r:
            found.append({"start": m.start(), "end": m.end(), "band": r[0], "raw": r[1]})
    for m in OVER_RE.finditer(text):
        found.append({"start": m.start(), "end": m.end(), "band": 10,
                       "raw": m.group(0).strip()})
    found.sort(key=lambda x: x["start"])
    deduped, last_end = [], -1
    for f in found:
        if f["start"] >= last_end:
            deduped.append(f)
            last_end = f["end"]
    return deduped


def strip_type_words(text):
    return re.sub(
        r"\b\w*urch\w*\b|\bpurchas\w*\b|\bsale\b|\bexchang\w*\b|\bpartial\b",
        "", text, flags=re.I,
    )


def parse_page(text, page_num, filing_year):
    """Content-anchored row extraction for one page."""
    if not re.search(r"transact", text, re.I) and "/" not in text:
        return []

    # Drop the page header — everything up to the end of the column-header
    # block. Prefer the last "Days Ago" (true end of the wrapped header);
    # fall back to the last "Amount" within the header region.
    region = text[:1600]
    days = list(DAYS_AGO_RE.finditer(region))
    if days:
        body = text[days[-1].end():]
    else:
        amt = list(AMOUNT_HDR_RE.finditer(text[:900]))
        body = text[amt[-1].end():] if amt else text

    out = []
    cursor = 0
    for am in iter_amounts(body):
        span = body[cursor:am["end"]]
        cursor = am["end"]

        # Accept only a transaction date — recent, near the filing year. Bond
        # maturity dates ("DUE 12/01/42") are excluded by the year window.
        tx_date = None
        for d in DATE_RE.finditer(span):
            iso = normalize_date(d)
            if not iso:
                continue
            year = int(iso[:4])
            if filing_year - 2 <= year <= filing_year:
                tx_date = (d, iso)  # keep the last plausible date before amount
        if tx_date is None:
            continue
        date_m, iso = tx_date

        head = span[: date_m.start()]
        tail = span[date_m.end():]

        ttype = classify_type(span) or fuzzy_type(head) or "Unknown"
        notif = bool(re.search(r"\by[e3]s\b", tail, re.I))

        desc = strip_type_words(head)
        desc = re.sub(r"\s+", " ", desc).strip(" .,-|:%@")
        # Trim a leading stray row-number / page-noise token, keep the name.
        desc = re.sub(r"^\d{1,4}\s+(?=[A-Za-z])", "", desc)
        # Trim a trailing leaked "<tx-date> No/Yes <amount-fragment>" tail.
        desc = re.sub(
            r"\s+\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{2,4}\s+(no|yes|y[e3]s)\b.*$",
            "", desc, flags=re.I,
        ).strip(" .,-|:%@")
        if len(desc) < 3:
            continue
        # Reject rows whose "description" is really page-header / form boilerplate
        # that happened to sit near a date + amount.
        if re.search(
            r"OGE Form|Updated Februar|if you need more|public form|"
            r"account numbers|Filer.?s Name|Page \d+ of|Transactions?$",
            desc, re.I,
        ):
            continue
        # Reject rows with no real alphabetic content (pure OCR digit noise).
        if len(re.sub(r"[^A-Za-z]", "", desc)) < 4:
            continue
        out.append({
            "sourcePage": page_num,
            "descriptionRaw": desc,
            "transactionType": ttype,
            "transactionDate": iso,
            "notificationLate": notif,
            "amountBand": am["band"],
            "amountRaw": am["raw"],
        })
    return out


def ocr_page(pdf_path, page_index):
    """OCR one page, caching the result — OCR is the slow, deterministic step."""
    import os  # noqa: PLC0415

    cache_dir = os.path.join("data", "cache", "ocr")
    os.makedirs(cache_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    cache_path = os.path.join(cache_dir, f"{base}.p{page_index}.txt")
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            return fh.read()

    import pypdfium2 as pdfium  # noqa: PLC0415
    import pytesseract  # noqa: PLC0415

    pdf = pdfium.PdfDocument(pdf_path)
    img = pdf[page_index].render(scale=3.5).to_pil()
    # PSM 4 ("single column of variable-size text") is the right model for
    # these one-column transaction forms. PSM 6 ("uniform block") smears the
    # table and loses ~98% of the digits.
    text = pytesseract.image_to_string(img, config="--psm 4")
    with open(cache_path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return text


def extract(pdf_path, filing_iso=None):
    import pdfplumber  # noqa: PLC0415

    filing_year = int(filing_iso[:4]) if filing_iso else 2026
    pdf = pdfplumber.open(pdf_path)
    n_pages = len(pdf.pages)
    declared_total = None
    rows = []
    page_reports = []

    for idx, page in enumerate(pdf.pages):
        embedded = page.extract_text() or ""
        if len(embedded) > 400 and len(DATE_RE.findall(embedded)) >= 2:
            text, source = embedded, "embedded"
        else:
            text, source = ocr_page(pdf_path, idx), "ocr"

        m = PAGE_OF_RE.search(text)
        if m and declared_total is None:
            declared_total = int(m.group(1))

        page_rows = parse_page(text, idx + 1, filing_year)
        rows.extend(page_rows)
        page_reports.append({
            "page": idx + 1, "textSource": source,
            "rowsFound": len(page_rows), "chars": len(text),
        })

    # Sequential numbering in document order — OCR row numbers are unreliable.
    for i, r in enumerate(rows, start=1):
        r["rowNumber"] = i

    return {
        "pdfPath": pdf_path,
        "pageCount": n_pages,
        "declaredPageTotal": declared_total,
        "pages": page_reports,
        "transactionCount": len(rows),
        "rows": rows,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: extract_278t.py <pdf_path> [filing_iso_date]", file=sys.stderr)
        sys.exit(2)
    filing = sys.argv[2] if len(sys.argv) > 2 else None
    json.dump(extract(sys.argv[1], filing), sys.stdout)
