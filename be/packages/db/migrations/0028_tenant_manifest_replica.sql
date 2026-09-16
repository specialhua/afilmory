CREATE TABLE "tenant_manifest_state" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_manifest_state" ADD CONSTRAINT "tenant_manifest_state_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "tenant_manifest_change" (
	"tenant_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"operation" text NOT NULL,
	"photo_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tenant_manifest_change_revision" UNIQUE("tenant_id","revision")
);
--> statement-breakpoint
ALTER TABLE "tenant_manifest_change" ADD CONSTRAINT "tenant_manifest_change_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_tenant_manifest_change_tenant_revision" ON "tenant_manifest_change" USING btree ("tenant_id","revision");
