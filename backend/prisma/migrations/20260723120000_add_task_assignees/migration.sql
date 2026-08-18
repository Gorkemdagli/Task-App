-- CreateTable
CREATE TABLE "task_assignees" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- Backfill: tek-assignee görevleri yeni join tablosuna kopyala
INSERT INTO "task_assignees" ("id", "task_id", "user_id", "assigned_at")
SELECT gen_random_uuid(), "id", "assignee_id", CURRENT_TIMESTAMP
FROM "tasks"
WHERE "assignee_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_task_id_user_id_key" ON "task_assignees"("task_id", "user_id");
CREATE INDEX "task_assignees_user_id_idx" ON "task_assignees"("user_id");

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_fkey";

-- DropIndex (eski assignee_id index)
DROP INDEX IF EXISTS "tasks_assignee_id_status_idx";

-- AlterTable: eski scalar kolonu kaldır
ALTER TABLE "tasks" DROP COLUMN "assignee_id";
