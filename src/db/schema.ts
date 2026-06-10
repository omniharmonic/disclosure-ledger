/**
 * Database schema — Presidential Conflict-of-Interest Tracker.
 *
 * Typed entity tables for referential integrity, plus one polymorphic
 * `graphEdges` table that projects the knowledge graph (ARCHITECTURE §5).
 * Authoritative data lives in the entity tables; the graph is a rebuildable
 * projection.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  smallint,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
  bigserial,
  index,
  uniqueIndex,
  unique,
} from "drizzle-orm/pg-core";

/** People / filers — extensible beyond the President. */
export const persons = pgTable("persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(), // 'President', 'Cabinet', ...
  /**
   * Policy power over traded companies, 0..1 — the `authority` scoring
   * component (President 1.0; future Cabinet/Congress filers lower).
   */
  authority: real("authority").default(1).notNull(),
  termStart: date("term_start"),
  termEnd: date("term_end"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Companies / securities issuers. */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ticker: text("ticker"),
    cik: text("cik"), // SEC EDGAR CIK
    figi: text("figi"), // deferred: populated when the OpenFIGI fallback lands
    parentId: uuid("parent_id"), // deferred: subsidiary→parent rollups (post-v1)
    sector: text("sector"), // GICS sector
    industry: text("industry"), // SIC industry description
    aliases: text("aliases").array(), // brands, subsidiaries, products
    description: text("description"),
    website: text("website"),
    oneLiner: text("one_liner"), // neutral one-sentence description
    impactSummary: text("impact_summary"), // factual Trump-administration intersection
    impactSources: text("impact_sources").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_companies_ticker").on(t.ticker),
    index("idx_companies_name").on(t.name),
  ],
);

/** Filings — one row per source PDF. */
export const filings = pgTable(
  "filings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => persons.id),
    formType: text("form_type").notNull(), // '278-T', '278e'
    ogeUnid: text("oge_unid"), // Domino UNID
    filingDate: date("filing_date").notNull(),
    reportPeriodStart: date("report_period_start"),
    reportPeriodEnd: date("report_period_end"),
    sourceUrl: text("source_url").notNull(),
    sourceDomain: text("source_domain"),
    pdfHash: text("pdf_hash").notNull(), // SHA-256
    rawPdfPath: text("raw_pdf_path"),
    /** Durable mirror of the raw PDF (S3-compatible object storage, W-9). */
    archiveUrl: text("archive_url"),
    pageCount: integer("page_count"),
    transactionCount: integer("transaction_count"),
    /**
     * An embedded PKCS#7 signature structure was detected in the PDF
     * (provenance signal). Distinct from signatureVerified, which stays null
     * until full cryptographic chain verification is implemented — presence
     * is never presented as verification.
     */
    signaturePresent: boolean("signature_present"),
    /**
     * Cryptographic verification result: true = CMS digest + signature
     * verified against the embedded certificate (document integrity intact);
     * false = signature present but FAILED verification; null = no signature
     * or not evaluable. Chain-to-root validation is out of scope and the UI
     * copy says "integrity verified", never "identity verified".
     */
    signatureVerified: boolean("signature_verified"),
    /** Subject CN of the embedded signing certificate, when readable. */
    signatureSigner: text("signature_signer"),
    parseMethod: text("parse_method"), // heuristic-ocr|heuristic-embedded|llm_adjudicated|skipped-278e
    parseConfidence: real("parse_confidence"), // 0..1
    status: text("status").default("pending").notNull(), // pending|parsed|review|published|superseded
    version: integer("version").default(1).notNull(), // corrections-as-versions (amended filings)
    supersedesId: uuid("supersedes_id"), // the canonical filing that superseded this copy
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_filings_pdf_hash").on(t.pdfHash),
    uniqueIndex("uq_filings_oge_unid").on(t.ogeUnid),
    index("idx_filings_date").on(t.filingDate),
    index("idx_filings_status").on(t.status),
  ],
);

/** Transactions — individual disclosed trades. */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => filings.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => persons.id),
    companyId: uuid("company_id").references(() => companies.id),
    rowNumber: integer("row_number").notNull(),
    sourcePage: integer("source_page"),
    descriptionRaw: text("description_raw").notNull(),
    transactionType: text("transaction_type").notNull(), // Purchase|Sale|Sale (Partial)|Exchange
    transactionDate: date("transaction_date").notNull(),
    disclosureDate: date("disclosure_date"),
    notificationLate: boolean("notification_late").default(false),
    amountBand: smallint("amount_band").notNull(), // 1..10
    amountMin: bigint("amount_min", { mode: "number" }).notNull(),
    amountMax: bigint("amount_max", { mode: "number" }),
    securityType: text("security_type"), // deferred: instrument classification (post-v1)
    owner: text("owner"), // deferred: 278-T scans rarely carry a legible owner column
    priceAtTxn: real("price_at_txn"),
    priceCurrent: real("price_current"),
    priceCurrentDate: date("price_current_date"),
    gainLossPct: real("gain_loss_pct"),
    rowConfidence: real("row_confidence"),
    reconciledSources: text("reconciled_sources").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_txn_company").on(t.companyId),
    index("idx_txn_date").on(t.transactionDate),
    index("idx_txn_filing").on(t.filingId),
    index("idx_txn_type").on(t.transactionType),
  ],
);

/** Statements — the President's public utterances. */
export const statements = pgTable(
  "statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => persons.id),
    spokenAt: date("spoken_at").notNull(),
    channel: text("channel"), // remarks|interview|truth_social|...
    venue: text("venue"),
    fullText: text("full_text").notNull(),
    source: text("source").notNull(), // app|cpd|truth_social|caption
    sourceUrl: text("source_url").notNull(),
    sourceRef: text("source_ref"), // DCPD package id, post id, video id
    attributionMethod: text("attribution_method").notNull(), // official_transcript|caption_derived
    attributionConf: real("attribution_conf").notNull(),
    needsReview: boolean("needs_review").default(false),
    contentHash: text("content_hash"),
    supersededBy: uuid("superseded_by"), // CPD upgrade of a faster source (FR-S6, reconciler pending)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_statements_content_hash").on(t.contentHash),
    index("idx_stmt_date").on(t.spokenAt),
    index("idx_stmt_source").on(t.source),
  ],
);

/** Detected company/sector mentions inside statements. */
export const statementMentions = pgTable(
  "statement_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => statements.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id),
    sector: text("sector"),
    exactQuote: text("exact_quote").notNull(), // verified present in fullText
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    sentiment: text("sentiment"), // positive|negative|neutral
    stance: text("stance"), // praise|threat|policy|tariff|...
    confidence: real("confidence").notNull(),
    method: text("method").notNull(), // gazetteer|ner|llm
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_mention_co").on(t.companyId), index("idx_mention_stmt").on(t.statementId)],
);

/** Official government actions. */
export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionType: text("action_type").notNull(), // executive_order|proclamation|tariff|contract|rule
    occurredOn: date("occurred_on").notNull(),
    signedOn: date("signed_on"),
    title: text("title").notNull(),
    summary: text("summary"),
    source: text("source").notNull(), // federal_register|usaspending|regulations
    sourceRef: text("source_ref"),
    sourceUrl: text("source_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_actions_source_ref").on(t.source, t.sourceRef),
    index("idx_action_date").on(t.occurredOn),
  ],
);

/** Which companies/sectors an action affects. */
export const actionTargets = pgTable(
  "action_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id),
    sector: text("sector"),
    linkMethod: text("link_method").notNull(), // named|sector|contract_recipient
    confidence: real("confidence").notNull(),
  },
  (t) => [index("idx_action_target_co").on(t.companyId)],
);

/** Correlations — materialized (trade ↔ event) pairs with scores. */
export const correlations = pgTable(
  "correlations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    eventKind: text("event_kind").notNull(), // statement | action
    statementId: uuid("statement_id").references(() => statements.id),
    actionId: uuid("action_id").references(() => actions.id),
    daysGap: integer("days_gap").notNull(), // event_date - transaction_date (signed)
    signalScore: real("signal_score").notNull(), // 0..100
    components: jsonb("components").notNull(), // every component value (auditable)
    scoringVersion: text("scoring_version").notNull(),
    // LLM reasoning verification (production pipeline; null = unverified).
    verifiedGenuine: boolean("verified_genuine"),
    verdictReason: text("verdict_reason"),
    // Stamped on every correlate run that re-scores this pair; rows the run
    // did not touch are pruned. Lets re-scoring preserve verdicts (FR-O2).
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_corr_txn").on(t.transactionId),
    index("idx_corr_score").on(t.signalScore),
    // One correlation per (trade, event) pair. NULLS NOT DISTINCT so the
    // unused statement/action column cannot create duplicate pairs (PG ≥ 15).
    unique("uq_corr_pair")
      .on(t.transactionId, t.eventKind, t.statementId, t.actionId)
      .nullsNotDistinct(),
  ],
);

/** Knowledge graph — polymorphic edge table, rebuilt each pipeline run. */
export const graphEdges = pgTable(
  "graph_edges",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    srcType: text("src_type").notNull(),
    srcId: uuid("src_id").notNull(),
    dstType: text("dst_type").notNull(),
    dstId: uuid("dst_id").notNull(),
    relType: text("rel_type").notNull(), // TRADED|MENTIONS|AFFECTS|IN_SECTOR|SIGNED|FILED|CORRELATES_WITH
    weight: real("weight"),
    properties: jsonb("properties"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
  },
  (t) => [
    index("idx_edges_src").on(t.srcType, t.srcId),
    index("idx_edges_dst").on(t.dstType, t.dstId),
    index("idx_edges_rel").on(t.relType),
  ],
);

/** Operational — ingestion run log. */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  stage: text("stage").notNull(), // discover|fetch|parse|enrich|correlate|graph
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  itemsFound: integer("items_found").default(0),
  itemsFailed: integer("items_failed").default(0),
  errors: jsonb("errors"),
  status: text("status").default("running").notNull(), // running|completed|failed
});

/** Operational — price cache, avoids redundant API calls. */
export const priceCache = pgTable(
  "price_cache",
  {
    ticker: text("ticker").notNull(),
    priceDate: date("price_date").notNull(),
    closePrice: real("close_price").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_price_cache").on(t.ticker, t.priceDate)],
);

/** Operational — public API keys (stored as SHA-256 hashes). */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label"),
  rateLimit: integer("rate_limit").default(1000), // requests/day
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * Operational — per-subject daily API usage counters (FR-API2). Subject is a
 * key id for authenticated calls or a hashed client IP for anonymous ones.
 * One row per (subject, day); incremented atomically on every request.
 */
export const apiUsage = pgTable(
  "api_usage",
  {
    subject: text("subject").notNull(),
    day: date("day").notNull(),
    count: integer("count").default(0).notNull(),
  },
  (t) => [uniqueIndex("uq_api_usage").on(t.subject, t.day)],
);

export type Person = typeof persons.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Filing = typeof filings.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Statement = typeof statements.$inferSelect;
export type StatementMention = typeof statementMentions.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Correlation = typeof correlations.$inferSelect;
export type GraphEdge = typeof graphEdges.$inferSelect;
