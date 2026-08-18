-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "archived_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "tasks_archived_at_idx" ON "tasks"("archived_at");
