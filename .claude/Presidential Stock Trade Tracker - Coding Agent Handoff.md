# Presidential Stock Trade Tracker — Coding Agent Handoff

## Build Specification for an AI Coding Agent

*Project by Benjamin Life (@omniharmonic)*
*May 2026*

---

## 1. What You're Building

A public-facing website that automatically ingests, parses, and displays every stock transaction reported by the President of the United States via OGE Form 278-T (Periodic Transaction Report) filings. The site should update itself whenever new filings appear, present the data in a searchable and sortable interface, and provide context about each trade (stock performance since purchase, sector, timing relative to policy announcements).

This is the first module of a larger civic accountability platform. Build it to be extensible — the same pipeline will eventually cover Cabinet members, members of Congress, and other senior officials.

---

## 2. Data Sources (Priority Order)

### 2.1 Primary: OGE Presidential Disclosures (Direct PDFs)

The Office of Government Ethics hosts all presidential financial disclosures on a Lotus Notes/Domino application at:

**Index page:** `https://extapps2.oge.gov/201/Presiden.nsf`

**Search/listing page:** `https://www.oge.gov/web/oge.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm=`

Individual PDFs follow this URL pattern:
```
https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/{DOCUMENT_ID}/$FILE/{FILENAME}
```

**Known Trump 278-T filing URLs (use these as seed data and to validate your parser):**

| Filing Date | URL |
|---|---|
| May 8, 2026 (Part 1) | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/5326D3AF5BE7C25385258DF7002DD1B7/$FILE/Trump,%20Donald%20J.-05.08.2026-278T.pdf` |
| May 8, 2026 (Part 2) | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/405E4EC4E27BE8D185258DF7002DD1C0/$FILE/Trump,%20Donald%20J.-05.08.2026-278T(2).pdf` |
| Jan 14, 2026 | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/268353939B7DACB585258D81003471B1/$FILE/Donald-J-Trump%201.14.2026-278T.pdf` |
| Nov 14, 2025 | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/903A217DC18563EC85258D4A0031B044/$FILE/Donald%20J.%20Trump%2011.14.2025%20278-T.pdf` |
| Oct 20, 2025 (Part 2) | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/18353894FE440B3685258D430031A337/$FILE/Donald%20J.%20Trump%2010.20.2025%20278-T%20(2).pdf` |
| Oct 17, 2025 | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/AA799A2729B4D1BE85258D430031A320/$FILE/Donald%20J.%20Trump%2010.17.2025%20278-T.pdf` |
| 2025 Annual (278e) | `https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/4EC9A8E6DD078F2985258CA9002C9377/$FILE/Trump,%20Donald%20J.%202025%20Annual%20278.pdf` |

**White House also hosts copies at:**
```
https://www.whitehouse.gov/wp-content/uploads/2026/03/President-Donald-J.-Trump-Periodic-Transaction-Report-2.26.26-1.pdf
https://www.whitehouse.gov/wp-content/uploads/2026/04/President-Donald-J.-Trump-Periodic-Transaction-Report-4.20.26.pdf
```

**Discovery challenge:** The OGE site is a Lotus Notes/Domino application (.nsf). There is no documented REST API for listing all documents. The listing page at the search collection URL loads data dynamically via JavaScript. You will need to either:

1. **Scrape the search page** — The search collection page has a table that loads dynamically. You may need a headless browser (Puppeteer/Playwright) to render the JavaScript and extract the table rows. Filter for "Trump" and document type "278-T".
2. **Poll known URL patterns** — The filenames follow semi-predictable patterns. You could construct candidate URLs and check for 200 responses.
3. **Monitor the White House uploads page** — Check `https://www.whitehouse.gov/disclosures/` or similar pages periodically.
4. **Use RSS/monitoring** — Set up a web change monitor (like Klaxon or Visualping) on the OGE search page to alert when new documents appear.

**Recommended approach:** Use Puppeteer/Playwright to scrape the OGE search collection page on a cron schedule (daily). Parse the table for new 278-T entries. When new entries appear, download the PDFs.

### 2.2 Secondary: ProPublica Trump Team Financial Disclosures

ProPublica maintains a structured dataset of Trump administration financial disclosures:

- **Interactive tool:** `https://projects.propublica.org/trump-team-financial-disclosures/`
- **Search:** `https://projects.propublica.org/trump-team-financial-disclosures/search/`
- **Data download:** `https://www.propublica.org/datastore/dataset/trump-administration-financial-disclosures`

The dataset includes names, agencies, job titles, and links to disclosure PDFs for 1,600+ officials. The data download requires agreeing to ProPublica's Data Terms of Use.

**Use this as:** A cross-reference and validation source. ProPublica's data is structured (CSV/JSON), which can verify your PDF parser output. It also extends coverage beyond just the president to appointees.

### 2.3 Tertiary: Quiver Quantitative API (Structured Trade Data)

Quiver Quantitative provides already-parsed congressional and executive trading data via API:

- **Website:** `https://www.quiverquant.com/congresstrading/`
- **API docs:** `https://www.quiverquant.com/congresstrading/stock/API`
- **Coverage:** 1,800+ US equities, data from 2016+, daily updates
- **Pricing:** Starts ~$10/month for basic API access
- **Data format:** JSON via REST API

**Use this as:** A fast-start data source while your PDF parser is being built. Also useful as ground truth to validate your parser against. The API provides structured data that your parser should eventually replicate from the primary PDFs.

### 2.4 Existing Parser: PublicI pfd-parser

The Center for Public Integrity built an open-source parser for OGE Form 278e (the annual report, not the 278-T periodic transaction report):

- **GitHub:** `https://github.com/PublicI/pfd-parser`
- **Status:** Alpha quality, last significant update uncertain
- **Input:** Single PDF or folder of OGE 278e PDFs
- **Output:** Up to 10 CSVs with extracted data
- **Limitation:** Designed for 278e (annual), not 278-T (periodic transactions). Does not handle scanned/non-standard PDFs.

**Use this as:** A reference implementation for PDF parsing approach. Study its extraction logic but expect to write a new parser specifically for the 278-T form structure, which is simpler than the 278e.

---

## 3. OGE Form 278-T Structure (What You're Parsing)

The 278-T is the simpler of the two disclosure forms. Each filing is a PDF with a cover page and one or more transaction pages.

### 3.1 Cover Page Fields

| Field | Description |
|---|---|
| Last Name | Filer's last name |
| First Name | Filer's first name |
| MI | Middle initial |
| Position | Official title |
| Agency | Employing agency |
| Filer's Certification Signature | Signature and date |
| Agency Ethics Official's Opinion | Compliance certification with signature and date |
| Comments | Reviewing official comments |

### 3.2 Transaction Table Columns

Each transaction page contains a numbered table with these columns:

| Column | Description | Example Values |
|---|---|---|
| **#** | Sequential row number | 1, 2, 3... |
| **Description** | Name of the security | "NVIDIA Corp (NVDA)", "Apple Inc (AAPL)", "U.S. Treasury Bill" |
| **Type** | Transaction type | "Purchase", "Sale", "Sale (Partial)", "Exchange" |
| **Date** | Transaction date (MM/DD/YYYY) | "01/15/2026" |
| **Notification Received Over 30 Days Ago** | Checkbox — whether filer was notified late | Checked or unchecked |
| **Amount** | Value range category (NOT exact dollar amount) | See amount bands below |

### 3.3 Amount Bands (Federal Disclosure Ranges)

The form does NOT report exact dollar amounts. It uses these statutory value bands:

| Band | Range |
|---|---|
| A | $1,001 – $15,000 |
| B | $15,001 – $50,000 |
| C | $50,001 – $100,000 |
| D | $100,001 – $250,000 |
| E | $250,001 – $500,000 |
| F | $500,001 – $1,000,000 |
| G | $1,000,001 – $5,000,000 |
| H | $5,000,001 – $25,000,000 |
| I | $25,000,001 – $50,000,000 |
| J | Over $50,000,000 |

**Important:** Your database schema should store both the band letter AND the min/max dollar values for that band. The UI should display the range (e.g., "$1M – $5M") rather than implying a precise figure.

### 3.4 What's Excluded from Reporting

These transaction types are NOT reported on the 278-T (don't expect to find them):
- Mutual funds and excepted investment funds
- Certificates of deposit, savings/checking accounts, money market accounts
- U.S. Treasury bills, notes, and bonds (though some filers voluntarily report these)
- Thrift Savings Plan accounts
- Real property
- Transactions solely between filer, spouse, and dependent children

### 3.5 Filing Frequency

The 278-T must be filed within 30 days of receiving notification of a transaction, but not later than 45 days after the transaction. In practice, filers batch their transactions and file periodically. Trump's recent filings have covered ~3 months of trades each, with the most recent two filings (May 8, 2026) covering 3,711 transactions across 113 pages spanning January 6 – March 30, 2026.

---

## 4. PDF Parsing Strategy

### 4.1 Recommended Approach

Use a multi-layer extraction strategy:

1. **First pass — structured PDF extraction:** Use `pdfplumber` (Python) or `pdf-parse`/`pdf2json` (Node.js) to extract text with position data. The 278-T uses a consistent table layout, so column positions should be deterministic within a given filing.

2. **Second pass — table detection:** Use `tabula-py` (Python, wraps Tabula Java) or `camelot` for table-specific extraction. These tools are purpose-built for extracting tabular data from PDFs.

3. **Fallback — LLM-assisted extraction:** For PDFs where structured extraction fails (OCR'd scans, non-standard layouts), pass the raw text through an LLM (Claude API) with a structured output schema to extract the transaction rows. This is expensive at scale but reliable as a fallback.

4. **Validation layer:** After extraction, validate each row:
   - Description should contain a recognizable security name or ticker
   - Type must be one of: Purchase, Sale, Sale (Partial), Exchange
   - Date must be a valid date
   - Amount must match one of the statutory bands (A–J)
   - Row numbers should be sequential

### 4.2 Ticker Resolution

The Description field in the 278-T contains the security name, sometimes with a ticker symbol in parentheses, sometimes without. You need a ticker resolution step:

- **Input:** "NVIDIA Corp (NVDA)" → trivial, ticker is in the description
- **Input:** "Bloom Energy Corporation" → needs lookup
- **Tools:**
  - SEC EDGAR `company_tickers.json`: `https://www.sec.gov/files/company_tickers.json` — maps company names to tickers and CIK numbers. Free, no auth required, ~10 requests/second.
  - OpenFIGI API: `https://www.openfigi.com/api` — free tier (20 requests/min, 100 jobs/request). Maps between identifiers.
  - Yahoo Finance search: Informal but effective for fuzzy name matching.

### 4.3 Enrichment Data (Per Ticker)

Once you have a ticker symbol, enrich each transaction with:

| Data Point | Source | API/URL |
|---|---|---|
| Current price | Yahoo Finance or similar | `yfinance` Python library or Alpha Vantage API |
| Price on transaction date | Yahoo Finance historical | `yfinance` library |
| Sector / Industry | SEC EDGAR SIC codes | `https://www.sec.gov/files/company_tickers.json` + SIC lookup |
| Company description | SEC EDGAR | Company filings |
| Performance since trade | Calculated | (current_price - trade_date_price) / trade_date_price |
| Market cap | Yahoo Finance | `yfinance` library |

**Rate limits to respect:**
- SEC EDGAR: 10 requests/second, must include a `User-Agent` header with contact email
- Yahoo Finance (via yfinance): Unofficial, no guaranteed rate limit, use caching aggressively
- Alpha Vantage: Free tier is 25 requests/day (too low for production — paid tiers start at $49.99/mo for 75 req/min)

---

## 5. Database Schema

Use PostgreSQL (via Supabase, Neon, or similar managed service for Next.js compatibility).

### 5.1 Core Tables

```sql
-- Filings: each PDF is one filing
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filer_name TEXT NOT NULL,             -- "Donald J. Trump"
  filer_position TEXT,                  -- "President"
  filer_agency TEXT,                    -- "Executive Office of the President"
  form_type TEXT NOT NULL,              -- "278-T" or "278e"
  filing_date DATE NOT NULL,            -- date the filing was submitted
  report_period_start DATE,             -- earliest transaction date in filing
  report_period_end DATE,               -- latest transaction date in filing
  source_url TEXT NOT NULL,             -- URL where PDF was downloaded
  source_domain TEXT,                   -- "extapps2.oge.gov" or "whitehouse.gov"
  pdf_hash TEXT UNIQUE NOT NULL,        -- SHA-256 of the PDF file (dedup)
  page_count INTEGER,
  transaction_count INTEGER,
  raw_pdf_path TEXT,                    -- path to stored PDF
  parsed_at TIMESTAMPTZ,
  parse_method TEXT,                    -- "pdfplumber", "tabula", "llm_fallback"
  parse_confidence REAL,               -- 0.0 to 1.0
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions: individual stock trades
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID REFERENCES filings(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,          -- sequential # from the PDF
  description TEXT NOT NULL,            -- raw text from Description column
  transaction_type TEXT NOT NULL,       -- "Purchase", "Sale", "Sale (Partial)", "Exchange"
  transaction_date DATE NOT NULL,
  notification_late BOOLEAN DEFAULT FALSE, -- the "Over 30 Days Ago" checkbox
  amount_band TEXT NOT NULL,            -- "A" through "J"
  amount_min BIGINT NOT NULL,           -- lower bound in dollars
  amount_max BIGINT NOT NULL,           -- upper bound in dollars
  
  -- Resolved ticker data (populated by enrichment pipeline)
  ticker TEXT,                          -- "NVDA", "AAPL", etc.
  company_name TEXT,                    -- cleaned company name
  security_type TEXT,                   -- "Stock", "ETF", "Bond", "Option"
  sector TEXT,                          -- GICS sector
  industry TEXT,                        -- GICS industry
  
  -- Price data (populated by enrichment pipeline)
  price_at_transaction REAL,            -- closing price on transaction_date
  price_current REAL,                   -- most recently fetched price
  price_current_date DATE,             -- when price_current was fetched
  gain_loss_pct REAL,                  -- calculated performance
  
  -- Metadata
  filer_or_spouse TEXT,                 -- "Filer", "Spouse", "Dependent" if determinable
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price history cache (avoid redundant API calls)
CREATE TABLE price_cache (
  ticker TEXT NOT NULL,
  price_date DATE NOT NULL,
  close_price REAL NOT NULL,
  volume BIGINT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, price_date)
);

-- Scrape log (track discovery runs)
CREATE TABLE scrape_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_type TEXT NOT NULL,            -- "oge_search", "whitehouse", "quiver"
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  new_filings_found INTEGER DEFAULT 0,
  errors TEXT[],
  status TEXT DEFAULT 'running'         -- "running", "completed", "failed"
);

-- Indexes
CREATE INDEX idx_transactions_ticker ON transactions(ticker);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_filing ON transactions(filing_id);
CREATE INDEX idx_filings_filer ON filings(filer_name);
CREATE INDEX idx_filings_date ON filings(filing_date);
```

---

## 6. Application Architecture (Next.js)

### 6.1 Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14+ (App Router) | SSR, API routes, ISR |
| Database | PostgreSQL (Supabase or Neon) | Structured data storage |
| ORM | Prisma or Drizzle | Type-safe DB access |
| PDF Parsing | Python microservice OR Node `pdf-parse` + `pdf-lib` | Extract transaction tables from PDFs |
| Job Scheduler | Vercel Cron OR GitHub Actions | Periodic scraping and enrichment |
| Hosting | Vercel | Deploy and serve |
| File Storage | Supabase Storage or S3-compatible | Store raw PDFs |
| Styling | Tailwind CSS | UI |
| Charts | Recharts or Chart.js | Visualizations |

### 6.2 Project Structure

```
presidential-trade-tracker/
├── app/
│   ├── page.tsx                    # Landing page — summary dashboard
│   ├── trades/
│   │   ├── page.tsx                # Full searchable/sortable trade table
│   │   └── [id]/page.tsx           # Individual trade detail
│   ├── filings/
│   │   ├── page.tsx                # List of all parsed filings
│   │   └── [id]/page.tsx           # Filing detail — link to PDF, all trades
│   ├── stocks/
│   │   └── [ticker]/page.tsx       # All trades for a given ticker
│   ├── api/
│   │   ├── scrape/route.ts         # Cron endpoint: discover new filings
│   │   ├── parse/route.ts          # Cron endpoint: parse pending PDFs
│   │   ├── enrich/route.ts         # Cron endpoint: resolve tickers, fetch prices
│   │   └── trades/route.ts         # Public API: query trades
│   └── about/page.tsx              # Methodology, data sources, attribution
├── lib/
│   ├── scraper.ts                  # OGE page scraping logic
│   ├── parser.ts                   # PDF → structured transaction data
│   ├── enricher.ts                 # Ticker resolution + price fetching
│   ├── db.ts                       # Database client
│   └── types.ts                    # TypeScript types
├── scripts/
│   ├── seed.ts                     # Initial data load from known URLs
│   ├── parse-pdf.ts                # CLI tool for manual PDF parsing
│   └── backfill-prices.ts          # Backfill historical prices
├── prisma/
│   └── schema.prisma               # Database schema
└── public/
    └── pdfs/                        # Cached copies of source PDFs
```

### 6.3 Data Pipeline (3 Cron Jobs)

**Job 1: Discover** (runs daily at 6am UTC)
```
1. Scrape OGE search collection page for new 278-T filings for "Trump"
2. Check White House uploads page for new PDFs
3. For each new URL found:
   a. Download the PDF
   b. Compute SHA-256 hash
   c. Check if hash exists in filings table (dedup)
   d. If new: store PDF, create filing record with status "pending"
   e. Log results to scrape_log
```

**Job 2: Parse** (runs daily at 7am UTC, after Discover)
```
1. Query filings where parsed_at IS NULL
2. For each pending filing:
   a. Extract text from PDF using pdfplumber/pdf-parse
   b. Identify transaction table rows
   c. For each row, extract: description, type, date, amount_band
   d. Map amount_band to min/max dollar values
   e. Insert transaction rows
   f. Update filing with parsed_at, transaction_count, parse_method
   g. If extraction confidence is low, flag for manual review
```

**Job 3: Enrich** (runs daily at 8am UTC, after Parse)
```
1. Query transactions where ticker IS NULL
2. For each unresolved transaction:
   a. Attempt ticker resolution from description text
   b. If ticker found: fetch sector/industry from SEC EDGAR
   c. Fetch price on transaction_date
   d. Fetch current price
   e. Calculate gain_loss_pct
   f. Update transaction row
3. Also: refresh price_current for all transactions (batch by ticker)
```

### 6.4 Key API Routes

**`GET /api/trades`** — Public API for querying trades
```
Query params:
  ?ticker=NVDA               # filter by ticker
  ?type=Purchase              # filter by transaction type
  ?dateFrom=2026-01-01        # date range
  ?dateTo=2026-03-31
  ?amountMin=F                # minimum amount band
  ?sortBy=date|amount|ticker  # sort field
  ?order=asc|desc
  ?page=1&limit=50            # pagination

Response: {
  trades: Transaction[],
  total: number,
  page: number,
  totalPages: number,
  meta: {
    lastUpdated: string,
    totalFilings: number,
    totalTransactions: number
  }
}
```

---

## 7. Frontend Design

### 7.1 Landing Page Dashboard

Display at a glance:
- **Total transactions** parsed (e.g., "3,711 stock trades disclosed")
- **Total estimated value range** (sum of amount band midpoints with range shown)
- **Date coverage** (earliest to latest transaction date)
- **Last filing date** and **next expected filing** (estimate based on 45-day cycle)
- **Top 10 holdings by estimated value** (bar chart)
- **Sector breakdown** (pie/donut chart)
- **Recent trades** (last 20 transactions, sortable table)
- **Gain/loss leaders** — biggest winners and losers since purchase

### 7.2 Trade Table Page

Full-width searchable, sortable, filterable table with columns:
- Date
- Description / Ticker
- Type (Purchase/Sale with color coding: green/red)
- Amount Range (display as "$1M – $5M" not just "G")
- Sector
- Price at Trade
- Current Price
- Gain/Loss % (color coded)
- Filing (link to source PDF)

Filters:
- Date range picker
- Transaction type (Purchase / Sale / Exchange)
- Sector dropdown
- Amount band minimum
- Search by ticker or company name

### 7.3 Stock Detail Page (`/stocks/[ticker]`)

For each ticker that appears in the disclosures:
- All transactions for that ticker (timeline view)
- Total estimated position size
- Performance chart (stock price with buy/sell markers overlaid)
- Company info (sector, industry, market cap)
- Link to SEC filings for that company

### 7.4 Filing Detail Page (`/filings/[id]`)

- Metadata (filer, date, agency)
- Summary stats (transaction count, value range)
- Direct link to source PDF at OGE
- All transactions from that filing in table format

### 7.5 About / Methodology Page

Must include:
- Explanation of OGE Form 278-T and the STOCK Act
- Data sources with links
- Explanation of amount bands (these are NOT exact figures)
- Parser methodology and confidence ratings
- Attribution: "Project by Benjamin Life (@omniharmonic)"
- Disclaimer: This is a transparency tool. Amount ranges are statutory estimates, not exact values.
- Last updated timestamp

---

## 8. Important Legal and Technical Notes

### 8.1 Legal Access Restrictions

The OGE search page displays this warning before access:

> Title 1 of the Ethics in Government Act of 1978, as amended, 5 U.S.C. § 13107(c), states that it shall be unlawful for any person to obtain or use a report: (A) for any unlawful purpose; (B) for any commercial purpose, other than by news and communications media for dissemination to the general public; (C) for determining or establishing the credit rating of any individual; or (D) for use, directly or indirectly, in the solicitation of money for any political, charitable, or other purpose.

**What this means for your scraper:** Accessing the data for public transparency / journalism purposes is explicitly permitted under exception (B). The scraper must NOT use the data for credit rating purposes, solicitation, or any commercial purpose other than news/media dissemination. The About page should clearly state the transparency purpose.

### 8.2 Rate Limiting and Politeness

- OGE website: No documented rate limits, but it's a government .nsf application — be polite. Space requests at least 2 seconds apart. Set a descriptive `User-Agent` header.
- SEC EDGAR: 10 requests/second maximum. Must include `User-Agent` with contact email per SEC fair access policy.
- Respect `robots.txt` on all domains.

### 8.3 Deduplication

Multiple sources may host the same filing. Always compute SHA-256 of downloaded PDFs and check against the `pdf_hash` column before parsing. The same filing may appear at both `extapps2.oge.gov` and `whitehouse.gov`.

### 8.4 Data Accuracy Caveats

Display prominently in the UI:
- Amount ranges are broad statutory bands, not exact dollar figures
- Transaction dates may differ from settlement dates
- Filing dates may be 30-45 days after transactions occurred
- Data is only as accurate as the original OGE filing
- The site does not constitute financial advice

---

## 9. Development Phases

### Phase 1: Static Seed (Week 1)
- Download all known Trump 278-T PDFs from the URLs listed in Section 2.1
- Build the PDF parser and validate against the known data
- Cross-reference parser output against Quiver Quantitative data for validation
- Set up database schema and seed with parsed data
- Build basic Next.js frontend with trade table

### Phase 2: Enrichment (Week 2)
- Implement ticker resolution pipeline
- Implement price fetching (historical + current)
- Build dashboard with charts
- Build stock detail pages
- Add gain/loss calculations

### Phase 3: Automation (Week 3)
- Implement OGE scraper for new filing discovery
- Set up cron jobs for discover → parse → enrich pipeline
- Implement scrape logging and error alerting
- Build filing detail pages
- Deploy to Vercel

### Phase 4: Polish (Week 4)
- Search and filter functionality
- Mobile responsive design
- About/methodology page
- Public API documentation
- Performance optimization (ISR, caching)
- SEO (meta tags, Open Graph, structured data)

---

## 10. Extensibility Notes (Future Scope)

This MVP covers the President only. The architecture should support future expansion to:

- **Cabinet members:** Same OGE portal, same 278-T form, same parser. Just add more names to the scraper's search list.
- **Members of Congress:** Different data sources — House uses `disclosures-clerk.house.gov/FinancialDisclosure`, Senate uses `efdsearch.senate.gov`. Both return scanned PDFs (image-based, requires OCR). The table structure differs from the OGE 278-T.
- **Cross-referencing with legislation:** The larger platform will eventually map stock holdings to legislative votes to flag conflicts of interest. This requires the `transactions` table to be joinable with a future `votes` table via industry/sector codes.
- **Campaign finance integration:** FEC data at `api.open.fec.gov` (1,000 requests/hour, free API key) connects donors to legislators. Future modules will link campaign contributions to trading patterns.

Design your database and API with these extensions in mind. Use consistent identifier schemes (OCD-IDs where applicable), keep the schema normalized, and make the parser modular so new form types can be added without rewriting the pipeline.

---

## 11. Reference Materials

| Resource | URL |
|---|---|
| OGE Form 278-T (blank form) | `https://www.oge.gov/Web/oge.nsf/OGE%20Forms/78E3B27A68F437DC852585B6005A23E9/$FILE/OGE%20Form%20278-T%20Dec%202023.pdf` |
| OGE Form 278-T Guide | `https://www.oge.gov/web/278eGuide.nsf/Form_278-T` |
| OGE Public Financial Disclosure Guide | `https://www.oge.gov/web/oge.nsf/Resources/Public+Financial+Disclosure+Guide` |
| OGE Individual Disclosures Search | `https://www.oge.gov/web/oge.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm=` |
| OGE Presidential/Appointee System | `https://extapps2.oge.gov/201/Presiden.nsf` |
| PublicI pfd-parser (GitHub) | `https://github.com/PublicI/pfd-parser` |
| PublicI federal-pfds-data (GitHub) | `https://github.com/PublicI/federal-pfds-data` |
| ProPublica Trump Team Disclosures | `https://projects.propublica.org/trump-team-financial-disclosures/` |
| ProPublica Data Download | `https://www.propublica.org/datastore/dataset/trump-administration-financial-disclosures` |
| Quiver Quantitative Congress Trading | `https://www.quiverquant.com/congresstrading/` |
| Capitol Trades | `https://www.capitoltrades.com` |
| SEC EDGAR Company Tickers | `https://www.sec.gov/files/company_tickers.json` |
| SEC EDGAR Fair Access Policy | `https://www.sec.gov/os/accessing-edgar-data` |
| OpenFIGI API | `https://www.openfigi.com/api` |
| FEC API | `https://api.open.fec.gov` |

---

*This document is the complete handoff specification. An AI coding agent should be able to build the entire application from this document alone, without requiring additional context or research.*
