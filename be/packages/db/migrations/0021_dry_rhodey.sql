DROP TABLE "photo_access_log" CASCADE;--> statement-breakpoint
DROP TABLE "photo_access_stat" CASCADE;--> statement-breakpoint
DELETE FROM "settings" WHERE "key" = 'photo.storage.secureAccess';--> statement-breakpoint
DELETE FROM "system_setting" WHERE "key" = 'system.storage.managed.secureAccess';
