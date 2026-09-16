CREATE TABLE "platform_activity_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"session_id" text,
	"event_type" text NOT NULL,
	"surface" text NOT NULL,
	"app_version" text,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb DEFAULT 'null'::jsonb,
	"after" jsonb DEFAULT 'null'::jsonb,
	"request_id" text,
	"batch_id" text,
	"result" text DEFAULT 'success' NOT NULL,
	"error_code" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_cleanup_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"inactive_months" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"deleted_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_cleanup_item" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_slug" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_activity_at" timestamp,
	"reason" text,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "uq_tenant_cleanup_item_batch_tenant" UNIQUE("batch_id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "last_signed_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "last_active_surface" text;--> statement-breakpoint
ALTER TABLE "platform_activity_event" ADD CONSTRAINT "platform_activity_event_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_activity_event" ADD CONSTRAINT "platform_activity_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_audit_log" ADD CONSTRAINT "super_admin_audit_log_actor_user_id_auth_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_batch" ADD CONSTRAINT "tenant_cleanup_batch_actor_user_id_auth_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_item" ADD CONSTRAINT "tenant_cleanup_item_batch_id_tenant_cleanup_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tenant_cleanup_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_platform_activity_user_occurred" ON "platform_activity_event" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_platform_activity_tenant_occurred" ON "platform_activity_event" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_platform_activity_type_occurred" ON "platform_activity_event" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_super_admin_audit_actor_occurred" ON "super_admin_audit_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_super_admin_audit_target_occurred" ON "super_admin_audit_log" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_super_admin_audit_batch" ON "super_admin_audit_log" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_cleanup_batch_created" ON "tenant_cleanup_batch" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tenant_cleanup_item_batch_status" ON "tenant_cleanup_item" USING btree ("batch_id","status");