-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('task_created', 'status_changed', 'task_reopened');

-- CreateTable
CREATE TABLE "task_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" "TaskEventType" NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus",
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_events_task_id_created_at_idx"
ON "task_events"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "task_events"
ADD CONSTRAINT "task_events_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Runtime connections switch to the Supabase-compatible authenticated role.
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_events" TO authenticated;

-- TaskEvent tenant scope is resolved through Task → Team → Tenant.
ALTER TABLE "task_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "task_events"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_events"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_events"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );
