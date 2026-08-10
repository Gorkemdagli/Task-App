-- R1 corrective migration: the two post-baseline task relation tables were
-- created after the initial RLS migration and must inherit the same boundary.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

ALTER TABLE "task_assignees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_assignees" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "task_assignees";
CREATE POLICY "tenant_isolation" ON "task_assignees"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_assignees"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_assignees"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

ALTER TABLE "task_status_acks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_status_acks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "task_status_acks";
CREATE POLICY "tenant_isolation" ON "task_status_acks"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_status_acks"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "tasks" t
      JOIN "teams" tm ON tm."id" = t."team_id"
      WHERE t."id" = "task_status_acks"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );
