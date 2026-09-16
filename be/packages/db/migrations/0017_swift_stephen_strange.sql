CREATE TABLE "gallery_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"subscriber_user_id" text NOT NULL,
	"target_tenant_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_gallery_subscription_subscriber_target" UNIQUE("subscriber_user_id","target_tenant_id")
);
--> statement-breakpoint
ALTER TABLE "gallery_subscription" ADD CONSTRAINT "gallery_subscription_subscriber_user_id_auth_user_id_fk" FOREIGN KEY ("subscriber_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_subscription" ADD CONSTRAINT "gallery_subscription_target_tenant_id_tenant_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_gallery_subscription_target" ON "gallery_subscription" USING btree ("target_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_gallery_subscription_subscriber_created" ON "gallery_subscription" USING btree ("subscriber_user_id","created_at");