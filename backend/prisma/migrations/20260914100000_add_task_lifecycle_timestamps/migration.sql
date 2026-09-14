-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "started_at" TIMESTAMPTZ(6),
ADD COLUMN "completed_at" TIMESTAMPTZ(6);
