-- AlterEnum: NotificationType yeni değerler
ALTER TYPE "NotificationType" ADD VALUE 'task_status_pending';
ALTER TYPE "NotificationType" ADD VALUE 'task_status_changed';

-- AlterTable: pending status kolonları (multi-assignee status ack için)
ALTER TABLE "tasks" ADD COLUMN "pending_status" "TaskStatus";
ALTER TABLE "tasks" ADD COLUMN "pending_proposed_by" UUID;
ALTER TABLE "tasks" ADD COLUMN "pending_proposed_at" TIMESTAMPTZ(6);

-- CreateTable: task_status_acks
CREATE TABLE "task_status_acks" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "proposed_status" "TaskStatus" NOT NULL,
    "acked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_acks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_status_acks_task_id_user_id_key" ON "task_status_acks"("task_id", "user_id");
CREATE INDEX "task_status_acks_task_id_idx" ON "task_status_acks"("task_id");

-- CreateIndex: pending cron sorgusu için
CREATE INDEX "tasks_pending_status_deadline_idx" ON "tasks"("pending_status", "deadline");

-- AddForeignKey
ALTER TABLE "task_status_acks" ADD CONSTRAINT "task_status_acks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "task_status_acks" ADD CONSTRAINT "task_status_acks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey: pending_proposed_by
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pending_proposed_by_fkey" FOREIGN KEY ("pending_proposed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
