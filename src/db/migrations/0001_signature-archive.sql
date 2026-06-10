ALTER TABLE "filings" ADD COLUMN IF NOT EXISTS "archive_url" text;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN IF NOT EXISTS "signature_signer" text;