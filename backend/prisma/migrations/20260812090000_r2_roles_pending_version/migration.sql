-- R2: global/team role separation and version-bound status acknowledgements.

UPDATE "users"
SET "role" = 'member'
WHERE "role" = 'teamAdmin';

UPDATE "users"
SET "role" = 'member'
WHERE "tenant_id" IS NULL
  AND "role" = 'companyAdmin';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('member', 'companyAdmin');

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "UserRole"
USING "role"::text::"UserRole";

DROP TYPE "UserRole_old";

ALTER TABLE "tasks"
ADD COLUMN "pending_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "task_status_acks"
ADD COLUMN "pending_version" INTEGER;

UPDATE "task_status_acks" AS ack
SET "pending_version" = task."pending_version"
FROM "tasks" AS task
WHERE task."id" = ack."task_id";

ALTER TABLE "task_status_acks"
ALTER COLUMN "pending_version" SET NOT NULL;

DROP INDEX "task_status_acks_task_id_user_id_key";
CREATE UNIQUE INDEX "task_status_acks_task_id_user_id_pending_version_key"
ON "task_status_acks"("task_id", "user_id", "pending_version");
