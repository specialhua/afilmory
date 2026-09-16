-- The originally released 0015 converted every tenant-local `user` identity into
-- a Workspace `member` and promoted the earliest such row to `owner` when the
-- legacy tenant had no administrator. In the legacy model those rows were also
-- created when somebody only signed in to a public Gallery for comments or
-- reactions, so they are not an explicit Workspace grant.
--
-- The migration-created `member` rows are structurally identifiable by the
-- deterministic `m_<md5>` IDs used exclusively by 0015. The false `owner` rows
-- can no longer be inferred from the post-0015 schema, so their exact tenant/user
-- pairs come from the isolated reconciliation of the 2026-07-31T15:08:20.893Z
-- pre-migration production backup. This is an auditable forward repair; it does
-- not grant any new permission.
CREATE TEMP TABLE "_revoked_legacy_membership" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"was_active_owner" boolean NOT NULL
) ON COMMIT DROP;--> statement-breakpoint

WITH "known_false_owner" ("tenant_id", "user_id") AS (
	VALUES
		('7386607879218849792', '7389446087650198528'),
		('7393730621594203136', '7400989654711410688'),
		('7393759108765905920', '7393759234889955328'),
		('7393828676638423040', '7393833546010129408'),
		('7393852658070665216', '7393853212968695808'),
		('7393873875056784384', '7393874008343376896'),
		('7393899540988621824', '7393899617090073600'),
		('7394136072733471744', '7394136288401806336'),
		('7394158820727182336', '7394161971847640064'),
		('7394172800752038912', '7394172951801508864'),
		('7394804436563774464', '7394806617244272640'),
		('7397078618169878528', '7394933582824084480'),
		('7400516934125336576', '7400517006368028672'),
		('7402501341948026880', '7402501397820350464'),
		('7402933573737127936', '7402853883976726528'),
		('7403604861728202752', '7403195231206252544'),
		('7404265812143204352', '7404273784560883712'),
		('7404714981527984128', '7404715203299731456'),
		('7406392119383648256', '7406392225786828800'),
		('7413381921958021120', '7413381972860094464'),
		('7414952805124521984', '7392287427491232768'),
		('7438989243262072832', '7438989281719646208'),
		('7443757422013367296', '7443757502497866752'),
		('7445420926758304768', '7445421012090163200'),
		('7449583085169016832', '7449579109212408832'),
		('7450023386077907968', '7450023473734667264'),
		('7479300598329015296', '7479299804547861504')
)
INSERT INTO "_revoked_legacy_membership" (
	"id",
	"tenant_id",
	"user_id",
	"was_active_owner"
)
SELECT
	"membership"."id",
	"membership"."tenant_id",
	"membership"."user_id",
	"membership"."role" = 'owner' AND "membership"."status" = 'active'
FROM "tenant_membership" "membership"
LEFT JOIN "known_false_owner" "false_owner"
	ON "false_owner"."tenant_id" = "membership"."tenant_id"
	AND "false_owner"."user_id" = "membership"."user_id"
WHERE (
	"membership"."role" = 'member'
	AND left("membership"."id", 2) = 'm_'
) OR (
	"false_owner"."tenant_id" IS NOT NULL
	AND "membership"."role" = 'owner'
	AND "membership"."id" = 'm_' || md5("membership"."tenant_id" || ':' || "membership"."user_id")
);--> statement-breakpoint

-- Re-home affected sessions before removing false grants. Prefer a proven
-- owner/admin Workspace, then an explicit post-migration member. A social-only
-- user remains globally signed in with no active Workspace.
WITH "affected_session" AS (
	SELECT
		"session"."id" AS "session_id",
		"replacement"."tenant_id" AS "replacement_tenant_id"
	FROM "auth_session" "session"
	INNER JOIN "_revoked_legacy_membership" "revoked"
		ON "revoked"."user_id" = "session"."user_id"
		AND "revoked"."tenant_id" = "session"."active_tenant_id"
	LEFT JOIN LATERAL (
		SELECT "candidate"."tenant_id"
		FROM "tenant_membership" "candidate"
		WHERE "candidate"."user_id" = "session"."user_id"
			AND "candidate"."status" = 'active'
			AND NOT EXISTS (
				SELECT 1
				FROM "_revoked_legacy_membership" "revoked_candidate"
				WHERE "revoked_candidate"."id" = "candidate"."id"
			)
		ORDER BY
			CASE "candidate"."role"
				WHEN 'owner' THEN 0
				WHEN 'admin' THEN 1
				ELSE 2
			END,
			"candidate"."updated_at" DESC,
			"candidate"."created_at" DESC,
			"candidate"."id" ASC
		LIMIT 1
	) "replacement" ON true
)
UPDATE "auth_session" "session"
SET
	"active_tenant_id" = "affected_session"."replacement_tenant_id",
	"updated_at" = now()
FROM "affected_session"
WHERE "session"."id" = "affected_session"."session_id";--> statement-breakpoint

DELETE FROM "tenant_membership" "membership"
USING "_revoked_legacy_membership" "revoked"
WHERE "membership"."id" = "revoked"."id";--> statement-breakpoint

-- One audited false-owner Workspace was marked active despite having no photos,
-- settings, domains, subscription, or active Session. If revoking a proven false
-- owner leaves an active Workspace ownerless, return it to the registration
-- state instead of preserving an unauthorized owner.
UPDATE "tenant" "workspace"
SET
	"status" = 'pending',
	"updated_at" = now()
WHERE "workspace"."status" = 'active'
	AND EXISTS (
		SELECT 1
		FROM "_revoked_legacy_membership" "revoked"
		WHERE "revoked"."tenant_id" = "workspace"."id"
			AND "revoked"."was_active_owner"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "tenant_membership" "owner"
		WHERE "owner"."tenant_id" = "workspace"."id"
			AND "owner"."role" = 'owner'
			AND "owner"."status" = 'active'
	);--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "tenant_membership"
		WHERE "role" = 'member'
			AND left("id", 2) = 'm_'
	) THEN
		RAISE EXCEPTION 'Legacy membership reconciliation aborted: a migration-generated member remains.';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "auth_session" "session"
		WHERE "session"."active_tenant_id" IS NOT NULL
			AND NOT EXISTS (
				SELECT 1
				FROM "tenant_membership" "membership"
				WHERE "membership"."tenant_id" = "session"."active_tenant_id"
					AND "membership"."user_id" = "session"."user_id"
					AND "membership"."status" = 'active'
			)
	) THEN
		RAISE EXCEPTION 'Legacy membership reconciliation aborted: an active Session lacks a matching Membership.';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "tenant" "workspace"
		WHERE "workspace"."status" = 'active'
			AND NOT EXISTS (
				SELECT 1
				FROM "tenant_membership" "owner"
				WHERE "owner"."tenant_id" = "workspace"."id"
					AND "owner"."role" = 'owner'
					AND "owner"."status" = 'active'
			)
	) THEN
		RAISE EXCEPTION 'Legacy membership reconciliation aborted: an active Workspace has no owner.';
	END IF;
END
$$;--> statement-breakpoint

DROP TABLE "_revoked_legacy_membership";
