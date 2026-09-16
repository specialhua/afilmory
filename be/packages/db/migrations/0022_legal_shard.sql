ALTER TABLE "tenant_domain" ADD COLUMN "cloudflare_hostname_id" text;--> statement-breakpoint
ALTER TABLE "tenant_domain" ADD COLUMN "hostname_status" text;--> statement-breakpoint
ALTER TABLE "tenant_domain" ADD COLUMN "ssl_status" text;--> statement-breakpoint
ALTER TABLE "tenant_domain" ADD COLUMN "verification_errors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_domain" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
UPDATE "tenant_domain"
SET "status" = 'pending', "verified_at" = NULL, "updated_at" = NOW();--> statement-breakpoint
ALTER TABLE "tenant_domain" DROP COLUMN "verification_token";
