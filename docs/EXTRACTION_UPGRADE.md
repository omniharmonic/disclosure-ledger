# PDF Extraction — Quality Upgrade Path

*Status of 278-T extraction and the planned OCR upgrade. Written so a future
agent can execute the Surya migration without re-researching.*

*Version 1.0 — May 2026*

---

## 1. Where extraction stands

The 278-T filings are **scanned PDFs**. The current pipeline renders each page
and OCRs it with **Tesseract (PSM 4)**, then a content-anchored parser
(`pipeline/extract_278t.py`) locates each transaction by its amount band and
date and assigns the other fields.

Recent fixes:
- **PSM 4** instead of PSM 6 — recovered ~98% of digits that PSM 6 lost.
- **Fuzzy type recovery** — the Type column is one of four values and OCR
  garbles it ("salo", "oun:hllso"). A `difflib` edit-distance match against the
  four canonical types recovers most rows. This cut `Unknown` transaction types
  from **49% to 15%** of the dataset.

The remaining ~15% `Unknown` types, and degraded `description` text, are limited
by **Tesseract's OCR accuracy on poor scans** — the genuine ceiling.

## 2. The upgrade: Surya OCR

Research (datalab-to/surya, ~20k stars — the OCR engine inside Marker and
Docling) shows **Surya scores 0.97 vs Tesseract's 0.88** normalized text
similarity on degraded scans. It is a modern transformer OCR built for exactly
this failure mode (small fonts, degraded government forms). Swapping Tesseract
→ Surya is the single highest-leverage extraction improvement and is expected
to eliminate most remaining word-level garbling.

### Constraints
- CPU-only (no GPU on GitHub Actions runners or the dev Mac). Surya on CPU is
  ~3–10 s/page — a ~6–10 page filing is 30–90 s; fine within the 60-min CI job.
- On macOS, run Surya on **CPU, not MPS** (`TORCH_DEVICE=cpu`) — Surya has known
  Apple MPS bugs.
- Heavy install: PyTorch + multi-GB Surya models. Acceptable as a one-time
  setup; cache `~/.cache/huggingface` + `~/.cache/datalab` in CI.
- License: GPL-3.0 + OpenRAIL (acceptable for this public-interest project).

### Integration plan
1. `pipeline/.venv/bin/pip install surya-ocr` (adds it to `requirements.txt`).
2. In `pipeline/extract_278t.py`, gate `ocr_page` on an `OCR_ENGINE` env var:
   `surya` → Surya, default → Tesseract. Cache Surya output under
   `data/cache/ocr-surya/` so the two engines' caches never mix.
3. Surya call (initialise predictors **once** per process — model load is the
   cost): render page at 200–300 DPI → `RecognitionPredictor` → sort
   `text_lines` by bbox → join. Verify the exact Surya API against the installed
   version before relying on it.
4. One-time backfill: clear `data/cache/ocr-surya/`, reset 278-T filings to
   `pending`, re-parse. Surya's per-line bounding boxes also enable a future
   column-geometry parser keyed on the #, Description, Type, Date, Amount
   x-positions.
5. Re-run the downstream pipeline (enrich → prices → mentions → correlate →
   verify → graph).

### Alternative considered
**Docling** (IBM, MIT-licensed, fastest CPU pipeline, with a TableFormer table
model) could replace the content-anchored parser entirely with model-driven
table extraction. A reasonable later migration; Surya-as-OCR is the lower-risk
first step because it keeps the working parser.

## 3. The reasoning layer (already built)

For fields OCR cannot recover, the LLM adjudicator (`src/pipeline/lib/
adjudicator.ts`) re-reads the source PDF with Claude under a strict schema. It
is gated on `ANTHROPIC_API_KEY` and runs only in the deployed pipeline. With a
truncation guard, it can only improve — never regress — an extraction.
