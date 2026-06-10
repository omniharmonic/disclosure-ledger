CREATE TABLE "action_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"company_id" uuid,
	"sector" text,
	"link_method" text NOT NULL,
	"confidence" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" text NOT NULL,
	"occurred_on" date NOT NULL,
	"signed_on" date,
	"title" text NOT NULL,
	"summary" text,
	"source" text NOT NULL,
	"source_ref" text,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"label" text,
	"rate_limit" integer DEFAULT 1000,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"subject" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ticker" text,
	"cik" text,
	"figi" text,
	"parent_id" uuid,
	"sector" text,
	"industry" text,
	"aliases" text[],
	"description" text,
	"website" text,
	"one_liner" text,
	"impact_summary" text,
	"impact_sources" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correlations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"statement_id" uuid,
	"action_id" uuid,
	"days_gap" integer NOT NULL,
	"signal_score" real NOT NULL,
	"components" jsonb NOT NULL,
	"scoring_version" text NOT NULL,
	"verified_genuine" boolean,
	"verdict_reason" text,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_corr_pair" UNIQUE NULLS NOT DISTINCT("transaction_id","event_kind","statement_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"form_type" text NOT NULL,
	"oge_unid" text,
	"filing_date" date NOT NULL,
	"report_period_start" date,
	"report_period_end" date,
	"source_url" text NOT NULL,
	"source_domain" text,
	"pdf_hash" text NOT NULL,
	"raw_pdf_path" text,
	"page_count" integer,
	"transaction_count" integer,
	"signature_present" boolean,
	"signature_verified" boolean,
	"parse_method" text,
	"parse_confidence" real,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"parsed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_edges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"src_type" text NOT NULL,
	"src_id" uuid NOT NULL,
	"dst_type" text NOT NULL,
	"dst_id" uuid NOT NULL,
	"rel_type" text NOT NULL,
	"weight" real,
	"properties" jsonb,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"items_found" integer DEFAULT 0,
	"items_failed" integer DEFAULT 0,
	"errors" jsonb,
	"status" text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"authority" real DEFAULT 1 NOT NULL,
	"term_start" date,
	"term_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_cache" (
	"ticker" text NOT NULL,
	"price_date" date NOT NULL,
	"close_price" real NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"company_id" uuid,
	"sector" text,
	"exact_quote" text NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"sentiment" text,
	"stance" text,
	"confidence" real NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"spoken_at" date NOT NULL,
	"channel" text,
	"venue" text,
	"full_text" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"source_ref" text,
	"attribution_method" text NOT NULL,
	"attribution_conf" real NOT NULL,
	"needs_review" boolean DEFAULT false,
	"content_hash" text,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filing_id" uuid NOT NULL,
	"person_id" uuid,
	"company_id" uuid,
	"row_number" integer NOT NULL,
	"source_page" integer,
	"description_raw" text NOT NULL,
	"transaction_type" text NOT NULL,
	"transaction_date" date NOT NULL,
	"disclosure_date" date,
	"notification_late" boolean DEFAULT false,
	"amount_band" smallint NOT NULL,
	"amount_min" bigint NOT NULL,
	"amount_max" bigint,
	"security_type" text,
	"owner" text,
	"price_at_txn" real,
	"price_current" real,
	"price_current_date" date,
	"gain_loss_pct" real,
	"row_confidence" real,
	"reconciled_sources" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_targets" ADD CONSTRAINT "action_targets_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_targets" ADD CONSTRAINT "action_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_mentions" ADD CONSTRAINT "statement_mentions_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_mentions" ADD CONSTRAINT "statement_mentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_action_target_co" ON "action_targets" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_actions_source_ref" ON "actions" USING btree ("source","source_ref");--> statement-breakpoint
CREATE INDEX "idx_action_date" ON "actions" USING btree ("occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_usage" ON "api_usage" USING btree ("subject","day");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_companies_ticker" ON "companies" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "idx_companies_name" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_corr_txn" ON "correlations" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_corr_score" ON "correlations" USING btree ("signal_score");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_filings_pdf_hash" ON "filings" USING btree ("pdf_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_filings_oge_unid" ON "filings" USING btree ("oge_unid");--> statement-breakpoint
CREATE INDEX "idx_filings_date" ON "filings" USING btree ("filing_date");--> statement-breakpoint
CREATE INDEX "idx_filings_status" ON "filings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_edges_src" ON "graph_edges" USING btree ("src_type","src_id");--> statement-breakpoint
CREATE INDEX "idx_edges_dst" ON "graph_edges" USING btree ("dst_type","dst_id");--> statement-breakpoint
CREATE INDEX "idx_edges_rel" ON "graph_edges" USING btree ("rel_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_price_cache" ON "price_cache" USING btree ("ticker","price_date");--> statement-breakpoint
CREATE INDEX "idx_mention_co" ON "statement_mentions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_mention_stmt" ON "statement_mentions" USING btree ("statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_statements_content_hash" ON "statements" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_stmt_date" ON "statements" USING btree ("spoken_at");--> statement-breakpoint
CREATE INDEX "idx_stmt_source" ON "statements" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_txn_company" ON "transactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_txn_date" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_txn_filing" ON "transactions" USING btree ("filing_id");--> statement-breakpoint
CREATE INDEX "idx_txn_type" ON "transactions" USING btree ("transaction_type");