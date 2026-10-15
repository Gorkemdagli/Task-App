CREATE POLICY "users_tenantless_self_profile_update" ON public.users
  FOR UPDATE TO authenticated
  USING (
    "id" = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND "tenant_id" IS NULL
    AND "role" = 'member'
  )
  WITH CHECK (
    "id" = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND "tenant_id" IS NULL
    AND "role" = 'member'
  );
