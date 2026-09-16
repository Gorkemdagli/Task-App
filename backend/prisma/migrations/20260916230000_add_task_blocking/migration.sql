-- Extend task history with explicit blocking transitions.
ALTER TYPE "TaskEventType" ADD VALUE 'task_blocked';
ALTER TYPE "TaskEventType" ADD VALUE 'task_unblocked';

ALTER TABLE "tasks"
  ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "blocked_since" TIMESTAMPTZ(6),
  ADD COLUMN "blocked_reason" TEXT;

CREATE INDEX "tasks_team_id_is_blocked_idx"
  ON "tasks"("team_id", "is_blocked");
