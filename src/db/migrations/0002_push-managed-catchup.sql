-- Catch-up for push-managed databases (e.g. the original Neon deployment,
-- whose schema was applied with `drizzle-kit push` before committed
-- migrations existed). Adds every schema element introduced by the
-- evaluation/remediation PR. Fully idempotent: a no-op on databases created
-- from the 0000 baseline.

-- scoring v1.1+: per-filer authority component
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "authority" real DEFAULT 1 NOT NULL;--> statement-breakpoint

-- correlate upsert semantics (verdict preservation, D2)
ALTER TABLE "correlations" ADD COLUMN IF NOT EXISTS "refreshed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- signature verification + durable archive provenance (FR-T3 / W-9)
ALTER TABLE "filings" ADD COLUMN IF NOT EXISTS "signature_present" boolean;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN IF NOT EXISTS "signature_signer" text;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN IF NOT EXISTS "archive_url" text;--> statement-breakpoint

-- API rate limiting (FR-API2)
CREATE TABLE IF NOT EXISTS "api_usage" (
	"subject" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_api_usage" ON "api_usage" USING btree ("subject","day");--> statement-breakpoint

-- One correlation per (trade, event) pair (D3). Existing push-managed
-- databases may hold duplicate pairs from the pre-fix correlate stage —
-- dedupe first, preferring a row with a verification verdict, then the
-- newest. NULLS NOT DISTINCT needs PG >= 15 (Neon is 15+).
DELETE FROM "correlations" c USING "correlations" keep
WHERE c.transaction_id = keep.transaction_id
  AND c.event_kind = keep.event_kind
  AND c.statement_id IS NOT DISTINCT FROM keep.statement_id
  AND c.action_id IS NOT DISTINCT FROM keep.action_id
  AND c.id <> keep.id
  AND (
    (c.verified_genuine IS NULL AND keep.verified_genuine IS NOT NULL)
    OR (
      (c.verified_genuine IS NULL) = (keep.verified_genuine IS NULL)
      AND (c.created_at, c.id) < (keep.created_at, keep.id)
    )
  );--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_corr_pair" ON "correlations" ("transaction_id","event_kind","statement_id","action_id") NULLS NOT DISTINCT;
