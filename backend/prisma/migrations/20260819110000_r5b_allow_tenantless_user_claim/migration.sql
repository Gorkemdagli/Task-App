-- Existing databases may have applied the original users policy before the
-- tenantless claim rule was added to the R1 migration source.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "users";
CREATE POLICY "tenant_isolation" ON "users"
  FOR ALL TO authenticated
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    OR "tenant_id" IS NULL
  )
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
