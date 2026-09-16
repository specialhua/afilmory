CREATE TYPE "public"."platform_role" AS ENUM('user', 'superadmin');--> statement-breakpoint
CREATE TYPE "public"."tenant_membership_role" AS ENUM('member', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "public"."tenant_membership_status" AS ENUM('active', 'suspended');--> statement-breakpoint

CREATE TABLE "tenant_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "tenant_membership_role" DEFAULT 'member' NOT NULL,
	"status" "tenant_membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tenant_membership_tenant_user" UNIQUE("tenant_id", "user_id")
);--> statement-breakpoint

ALTER TABLE "creem_subscription" ADD COLUMN "tenant_id" text;--> statement-breakpoint

-- Build identity components from exact, non-credential OAuth identities and a
-- narrowly trusted verified-email bridge. The bridge is available only when
-- every legacy user for that normalized email is verified and owns exclusively
-- GitHub/Google OAuth accounts. Credential and unknown-provider identities never
-- merge by email.
CREATE TEMP TABLE "_identity_user_map" AS
WITH RECURSIVE
"oauth_edges" AS (
	SELECT DISTINCT
		"left_account"."user_id" AS "left_user_id",
		"right_account"."user_id" AS "right_user_id"
	FROM "auth_account" "left_account"
	INNER JOIN "auth_account" "right_account"
		ON "right_account"."provider_id" = "left_account"."provider_id"
		AND "right_account"."account_id" = "left_account"."account_id"
	WHERE "left_account"."provider_id" <> 'credential'
),
"trusted_oauth_users" AS (
	SELECT
		"user"."id" AS "user_id",
		lower(trim("user"."email")) AS "normalized_email"
	FROM "auth_user" "user"
	WHERE "user"."email_verified"
		AND lower(trim("user"."email")) <> ''
		AND EXISTS (
			SELECT 1
			FROM "auth_account" "account"
			WHERE "account"."user_id" = "user"."id"
				AND "account"."provider_id" IN ('github', 'google')
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "auth_account" "account"
			WHERE "account"."user_id" = "user"."id"
				AND "account"."provider_id" NOT IN ('github', 'google')
		)
),
"trusted_email_groups" AS (
	SELECT lower(trim("user"."email")) AS "normalized_email"
	FROM "auth_user" "user"
	LEFT JOIN "trusted_oauth_users" "trusted"
		ON "trusted"."user_id" = "user"."id"
	GROUP BY lower(trim("user"."email"))
	HAVING count(*) > 1
		AND count("trusted"."user_id") = count(*)
),
"trusted_email_edges" AS (
	SELECT DISTINCT
		"left_user"."user_id" AS "left_user_id",
		"right_user"."user_id" AS "right_user_id"
	FROM "trusted_oauth_users" "left_user"
	INNER JOIN "trusted_email_groups" "group"
		ON "group"."normalized_email" = "left_user"."normalized_email"
	INNER JOIN "trusted_oauth_users" "right_user"
		ON "right_user"."normalized_email" = "left_user"."normalized_email"
),
"identity_edges" AS (
	SELECT "left_user_id", "right_user_id" FROM "oauth_edges"
	UNION
	SELECT "left_user_id", "right_user_id" FROM "trusted_email_edges"
),
"reachable"("root_user_id", "user_id") AS (
	SELECT "id", "id"
	FROM "auth_user"
	UNION
	SELECT "reachable"."root_user_id", "identity_edges"."right_user_id"
	FROM "reachable"
	INNER JOIN "identity_edges"
		ON "identity_edges"."left_user_id" = "reachable"."user_id"
),
"components" AS (
	SELECT "user_id", min("root_user_id") AS "component_id"
	FROM "reachable"
	GROUP BY "user_id"
),
"ranked" AS (
	SELECT
		"user"."id" AS "old_user_id",
		first_value("user"."id") OVER (
			PARTITION BY "components"."component_id"
			ORDER BY
				CASE WHEN "user"."role" = 'superadmin' THEN 0 ELSE 1 END,
				"user"."email_verified" DESC,
				"user"."created_at" ASC,
				"user"."id" ASC
		) AS "canonical_user_id",
		"user"."tenant_id" AS "old_tenant_id",
		"user"."role"::text AS "old_role",
		"user"."created_at" AS "old_created_at",
		"user"."updated_at" AS "old_updated_at"
	FROM "auth_user" "user"
	INNER JOIN "components"
		ON "components"."user_id" = "user"."id"
)
SELECT * FROM "ranked";--> statement-breakpoint

CREATE UNIQUE INDEX "_identity_user_map_old_user" ON "_identity_user_map" ("old_user_id");--> statement-breakpoint

-- Fail closed when duplicate email identities remain outside the exact OAuth or
-- verified trusted-provider reconciliation boundaries.
DO $$
BEGIN
	IF EXISTS (
		SELECT lower(trim("user"."email"))
		FROM "auth_user" "user"
		INNER JOIN "_identity_user_map" "map"
			ON "map"."old_user_id" = "user"."id"
		WHERE "map"."old_user_id" = "map"."canonical_user_id"
		GROUP BY lower(trim("user"."email"))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Global identity migration aborted: duplicate normalized emails remain after trusted identity reconciliation.';
	END IF;

	IF EXISTS (
		SELECT "account"."provider_id", "account"."account_id"
		FROM "auth_account" "account"
		INNER JOIN "_identity_user_map" "map"
			ON "map"."old_user_id" = "account"."user_id"
		GROUP BY "account"."provider_id", "account"."account_id"
		HAVING count(DISTINCT "map"."canonical_user_id") > 1
	) THEN
		RAISE EXCEPTION 'Global identity migration aborted: an auth account maps to multiple canonical users.';
	END IF;

	IF EXISTS (
		SELECT "map"."canonical_user_id"
		FROM "_identity_user_map" "map"
		INNER JOIN "auth_user" "user"
			ON "user"."id" = "map"."old_user_id"
		WHERE "user"."creem_customer_id" IS NOT NULL
		GROUP BY "map"."canonical_user_id"
		HAVING count(DISTINCT "user"."creem_customer_id") > 1
	) THEN
		RAISE EXCEPTION 'Global identity migration aborted: one canonical user has multiple Creem customer identities.';
	END IF;
END
$$;--> statement-breakpoint

-- Only a legacy tenant administrator is evidence of Workspace authorization.
-- Legacy `user` rows were also created when somebody merely authenticated in a
-- public Gallery for comments or reactions, so those rows must remain global
-- identities without receiving a Membership.
INSERT INTO "tenant_membership" (
	"id",
	"tenant_id",
	"user_id",
	"role",
	"status",
	"created_at",
	"updated_at"
)
SELECT
	'm_' || md5("map"."old_tenant_id" || ':' || "map"."canonical_user_id"),
	"map"."old_tenant_id",
	"map"."canonical_user_id",
	CASE
		WHEN bool_or("map"."old_role" IN ('admin', 'superadmin')) THEN 'admin'::"tenant_membership_role"
		ELSE 'member'::"tenant_membership_role"
	END,
	'active'::"tenant_membership_status",
	min("map"."old_created_at"),
	max("map"."old_updated_at")
FROM "_identity_user_map" "map"
WHERE "map"."old_tenant_id" IS NOT NULL
GROUP BY "map"."old_tenant_id", "map"."canonical_user_id"
HAVING bool_or("map"."old_role" IN ('admin', 'superadmin'));--> statement-breakpoint

-- Select exactly one owner from the proven legacy administrator set. An active
-- Workspace without a legacy administrator is intentionally rejected below;
-- ordinary social identities must never be promoted to repair missing ownership.
WITH "owner_candidates" AS (
	SELECT
		"membership"."id",
		row_number() OVER (
			PARTITION BY "membership"."tenant_id"
			ORDER BY
				"membership"."created_at" ASC,
				"membership"."id" ASC
		) AS "owner_rank"
	FROM "tenant_membership" "membership"
)
UPDATE "tenant_membership" "membership"
SET "role" = 'owner'
FROM "owner_candidates"
WHERE "owner_candidates"."id" = "membership"."id"
	AND "owner_candidates"."owner_rank" = 1;--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "tenant" "tenant"
		WHERE "tenant"."status" = 'active'
			AND NOT EXISTS (
				SELECT 1
				FROM "tenant_membership" "membership"
				WHERE "membership"."tenant_id" = "tenant"."id"
					AND "membership"."role" = 'owner'
					AND "membership"."status" = 'active'
			)
	) THEN
		RAISE EXCEPTION 'Global identity migration aborted: an active workspace has no owner.';
	END IF;
END
$$;--> statement-breakpoint

-- Backfill subscription ownership before removing auth_user.tenant_id.
UPDATE "creem_subscription" "subscription"
SET "tenant_id" = "user"."tenant_id"
FROM "auth_user" "user"
WHERE "subscription"."reference_id" = "user"."id"
	AND "subscription"."tenant_id" IS NULL
	AND "user"."tenant_id" IS NOT NULL;--> statement-breakpoint

-- Merge global user attributes that have safe aggregation semantics.
WITH "user_aggregate" AS (
	SELECT
		"map"."canonical_user_id",
		bool_or("user"."had_trial") AS "had_trial",
		bool_or("user"."banned") AS "banned",
		bool_or("user"."role" = 'superadmin') AS "is_superadmin",
		max("user"."creem_customer_id") AS "creem_customer_id",
		(array_agg(
			"user"."ban_reason"
			ORDER BY "user"."updated_at" DESC, "user"."id" ASC
		) FILTER (
			WHERE "user"."banned" AND "user"."ban_reason" IS NOT NULL
		))[1] AS "ban_reason",
		CASE
			WHEN bool_or("user"."banned" AND "user"."ban_expires_at" IS NULL) THEN NULL
			ELSE max("user"."ban_expires_at") FILTER (WHERE "user"."banned")
		END AS "ban_expires_at"
	FROM "_identity_user_map" "map"
	INNER JOIN "auth_user" "user"
		ON "user"."id" = "map"."old_user_id"
	GROUP BY "map"."canonical_user_id"
)
UPDATE "auth_user" "user"
SET
	"had_trial" = "aggregate"."had_trial",
	"banned" = "aggregate"."banned",
	"ban_reason" = "aggregate"."ban_reason",
	"ban_expires_at" = "aggregate"."ban_expires_at",
	"role" = CASE
		WHEN "aggregate"."is_superadmin" THEN 'superadmin'::"user_role"
		ELSE 'user'::"user_role"
	END,
	"creem_customer_id" = COALESCE("user"."creem_customer_id", "aggregate"."creem_customer_id")
FROM "user_aggregate" "aggregate"
WHERE "user"."id" = "aggregate"."canonical_user_id";--> statement-breakpoint

-- Re-key comments and deduplicate reactions before changing their foreign keys.
UPDATE "comment" "comment"
SET "user_id" = "map"."canonical_user_id"
FROM "_identity_user_map" "map"
WHERE "comment"."user_id" = "map"."old_user_id";--> statement-breakpoint

WITH "ranked_reactions" AS (
	SELECT
		"reaction"."id",
		row_number() OVER (
			PARTITION BY
				"reaction"."tenant_id",
				"reaction"."comment_id",
				"map"."canonical_user_id",
				"reaction"."reaction"
			ORDER BY "reaction"."created_at" ASC, "reaction"."id" ASC
		) AS "reaction_rank"
	FROM "comment_reaction" "reaction"
	INNER JOIN "_identity_user_map" "map"
		ON "map"."old_user_id" = "reaction"."user_id"
)
DELETE FROM "comment_reaction" "reaction"
USING "ranked_reactions"
WHERE "ranked_reactions"."id" = "reaction"."id"
	AND "ranked_reactions"."reaction_rank" > 1;--> statement-breakpoint

UPDATE "comment_reaction" "reaction"
SET "user_id" = "map"."canonical_user_id"
FROM "_identity_user_map" "map"
WHERE "reaction"."user_id" = "map"."old_user_id";--> statement-breakpoint

-- Keep one external account per provider identity and one credential account per
-- canonical user. External OAuth accounts retain the freshest token row.
WITH "ranked_external_accounts" AS (
	SELECT
		"account"."id",
		row_number() OVER (
			PARTITION BY "account"."provider_id", "account"."account_id"
			ORDER BY
				"account"."updated_at" DESC,
				CASE WHEN "map"."old_user_id" = "map"."canonical_user_id" THEN 0 ELSE 1 END,
				"account"."id" ASC
		) AS "account_rank"
	FROM "auth_account" "account"
	INNER JOIN "_identity_user_map" "map"
		ON "map"."old_user_id" = "account"."user_id"
	WHERE "account"."provider_id" <> 'credential'
)
DELETE FROM "auth_account" "account"
USING "ranked_external_accounts"
WHERE "ranked_external_accounts"."id" = "account"."id"
	AND "ranked_external_accounts"."account_rank" > 1;--> statement-breakpoint

WITH "ranked_credential_accounts" AS (
	SELECT
		"account"."id",
		row_number() OVER (
			PARTITION BY "map"."canonical_user_id"
			ORDER BY
				CASE WHEN "map"."old_user_id" = "map"."canonical_user_id" THEN 0 ELSE 1 END,
				"account"."updated_at" DESC,
				"account"."id" ASC
		) AS "account_rank"
	FROM "auth_account" "account"
	INNER JOIN "_identity_user_map" "map"
		ON "map"."old_user_id" = "account"."user_id"
	WHERE "account"."provider_id" = 'credential'
)
DELETE FROM "auth_account" "account"
USING "ranked_credential_accounts"
WHERE "ranked_credential_accounts"."id" = "account"."id"
	AND "ranked_credential_accounts"."account_rank" > 1;--> statement-breakpoint

UPDATE "auth_account" "account"
SET "user_id" = "map"."canonical_user_id"
FROM "_identity_user_map" "map"
WHERE "account"."user_id" = "map"."old_user_id";--> statement-breakpoint

UPDATE "auth_account"
SET "account_id" = "user_id"
WHERE "provider_id" = 'credential';--> statement-breakpoint

UPDATE "creem_subscription" "subscription"
SET "reference_id" = "map"."canonical_user_id"
FROM "_identity_user_map" "map"
WHERE "subscription"."reference_id" = "map"."old_user_id";--> statement-breakpoint

-- A tenant-bound cookie must never be silently promoted into a global session.
DELETE FROM "auth_session";--> statement-breakpoint

DELETE FROM "auth_user" "user"
USING "_identity_user_map" "map"
WHERE "user"."id" = "map"."old_user_id"
	AND "map"."old_user_id" <> "map"."canonical_user_id";--> statement-breakpoint

UPDATE "auth_user"
SET "email" = lower(trim("email"));--> statement-breakpoint

-- Replace tenant-bound constraints with global identity constraints.
ALTER TABLE "auth_session" RENAME COLUMN "tenant_id" TO "active_tenant_id";--> statement-breakpoint
ALTER TABLE "auth_account" DROP CONSTRAINT "uq_auth_account_tenant_provider";--> statement-breakpoint
ALTER TABLE "auth_user" DROP CONSTRAINT "uq_auth_user_tenant_email";--> statement-breakpoint
ALTER TABLE "auth_account" DROP CONSTRAINT "auth_account_tenant_id_tenant_id_fk";--> statement-breakpoint
ALTER TABLE "auth_session" DROP CONSTRAINT "auth_session_tenant_id_tenant_id_fk";--> statement-breakpoint
ALTER TABLE "auth_user" DROP CONSTRAINT "auth_user_tenant_id_tenant_id_fk";--> statement-breakpoint
DROP INDEX "idx_auth_account_tenant";--> statement-breakpoint
DROP INDEX "idx_auth_account_provider";--> statement-breakpoint
DROP INDEX "idx_auth_user_email";--> statement-breakpoint
DROP INDEX "idx_auth_user_tenant";--> statement-breakpoint

ALTER TABLE "auth_user" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "role" SET DATA TYPE "public"."platform_role"
USING (
	CASE WHEN "role"::text = 'superadmin' THEN 'superadmin' ELSE 'user' END
)::"public"."platform_role";--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint

ALTER TABLE "tenant_membership" ADD CONSTRAINT "tenant_membership_tenant_id_tenant_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_membership" ADD CONSTRAINT "tenant_membership_user_id_auth_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_membership_active_owner"
	ON "tenant_membership" USING btree ("tenant_id")
	WHERE "tenant_membership"."role" = 'owner' AND "tenant_membership"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_tenant_membership_user_status"
	ON "tenant_membership" USING btree ("user_id", "status");--> statement-breakpoint
CREATE INDEX "idx_tenant_membership_tenant_role_status"
	ON "tenant_membership" USING btree ("tenant_id", "role", "status");--> statement-breakpoint

ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_active_tenant_id_tenant_id_fk"
	FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creem_subscription" ADD CONSTRAINT "creem_subscription_tenant_id_tenant_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_auth_user_email_normalized" ON "auth_user" USING btree (lower(trim("email")));--> statement-breakpoint
ALTER TABLE "auth_account" DROP COLUMN "tenant_id";--> statement-breakpoint
ALTER TABLE "auth_user" DROP COLUMN "tenant_id";--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "uq_auth_account_provider" UNIQUE("provider_id", "account_id");--> statement-breakpoint
DROP TABLE "_identity_user_map";--> statement-breakpoint
DROP TYPE "public"."user_role";
