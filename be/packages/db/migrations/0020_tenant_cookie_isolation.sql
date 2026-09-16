-- Sessions issued before this migration used a parent-domain Cookie and could
-- be sent to every managed tenant host. The new host-only cookie namespace must
-- not silently accept those bearer tokens under a different cookie name.
DELETE FROM "auth_session";--> statement-breakpoint
