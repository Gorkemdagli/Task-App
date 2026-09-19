-- Add structured task detail fields.
ALTER TABLE "tasks"
  ADD COLUMN "scope_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "target_audience" TEXT,
  ADD COLUMN "expected_output" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve existing task history and append the new event types.
ALTER TYPE "TaskEventType" ADD VALUE 'assignee_added';
ALTER TYPE "TaskEventType" ADD VALUE 'assignee_removed';
ALTER TYPE "TaskEventType" ADD VALUE 'status_change_requested';
ALTER TYPE "TaskEventType" ADD VALUE 'status_change_approved';
ALTER TYPE "TaskEventType" ADD VALUE 'status_change_rejected';
ALTER TYPE "TaskEventType" ADD VALUE 'priority_changed';
ALTER TYPE "TaskEventType" ADD VALUE 'deadline_changed';
ALTER TYPE "TaskEventType" ADD VALUE 'file_added';
ALTER TYPE "TaskEventType" ADD VALUE 'file_deleted';

-- Store tenant-scoped task file metadata; object bytes live in private storage.
CREATE TABLE "task_files" (
    "id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "object_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,

    CONSTRAINT "task_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_files_object_path_key"
ON "task_files"("object_path");

CREATE INDEX "task_files_task_id_deleted_at_created_at_idx"
ON "task_files"("task_id", "deleted_at", "created_at");

CREATE INDEX "task_files_tenant_id_idx"
ON "task_files"("tenant_id");

ALTER TABLE "task_files"
ADD CONSTRAINT "task_files_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "task_files"
ADD CONSTRAINT "task_files_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "task_files"
ADD CONSTRAINT "task_files_uploader_id_fkey"
FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "task_files"
ADD CONSTRAINT "task_files_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

GRANT SELECT, INSERT, UPDATE ON "task_files" TO authenticated;

ALTER TABLE "task_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_files" FORCE ROW LEVEL SECURITY;

CREATE POLICY "task_files_select" ON "task_files"
  FOR SELECT TO authenticated
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_files"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY "task_files_insert" ON "task_files"
  FOR INSERT TO authenticated
  WITH CHECK (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_files"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."id" = "task_files"."uploader_id"
        AND u."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
    AND (
      "task_files"."deleted_by_id" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "users" u
        WHERE u."id" = "task_files"."deleted_by_id"
          AND u."tenant_id" = current_setting('app.tenant_id', true)::uuid
      )
    )
  );

CREATE POLICY "task_files_update" ON "task_files"
  FOR UPDATE TO authenticated
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_files"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_files"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."id" = "task_files"."uploader_id"
        AND u."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
    AND (
      "task_files"."deleted_by_id" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "users" u
        WHERE u."id" = "task_files"."deleted_by_id"
          AND u."tenant_id" = current_setting('app.tenant_id', true)::uuid
      )
    )
  );

-- Task history is append-only for application roles.
REVOKE UPDATE, DELETE ON "task_events" FROM authenticated;
GRANT SELECT, INSERT ON "task_events" TO authenticated;

DROP POLICY IF EXISTS "tenant_isolation" ON "task_events";

CREATE POLICY "task_events_select" ON "task_events"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_events"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY "task_events_insert" ON "task_events"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_events"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );
