CREATE TYPE "public"."apns_environment" AS ENUM('development', 'production');--> statement-breakpoint
CREATE TABLE "apns_device" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_token" text NOT NULL,
	"environment" "apns_environment" NOT NULL,
	"locale" text,
	"app_version" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_apns_device_token_environment" UNIQUE("device_token","environment")
);
--> statement-breakpoint
ALTER TABLE "apns_device" ADD CONSTRAINT "apns_device_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_apns_device_user_enabled" ON "apns_device" USING btree ("user_id","enabled");