ALTER TABLE "users"
  ADD COLUMN "notify_task_assigned" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_task_commented" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_message_received" BOOLEAN NOT NULL DEFAULT true;
