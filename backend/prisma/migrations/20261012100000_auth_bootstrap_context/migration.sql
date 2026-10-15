CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE FUNCTION private.auth_user_id_by_email(input_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u.email = $1
$$;

REVOKE ALL ON FUNCTION private.auth_user_id_by_email(text) FROM PUBLIC;

DO $$
DECLARE
  function_owner name;
BEGIN
  SELECT r.rolname INTO function_owner
  FROM pg_proc p
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE p.oid = 'private.auth_user_id_by_email(text)'::regprocedure;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = function_owner AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'auth_user_id_by_email owner must bypass forced users RLS';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA private FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.auth_user_id_by_email(text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA private FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION private.auth_user_id_by_email(text) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskflow_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA private TO taskflow_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.auth_user_id_by_email(text) TO taskflow_app';
  END IF;
END
$$;

DROP POLICY IF EXISTS "tenant_isolation" ON public.users;
CREATE POLICY "tenant_isolation" ON public.users
  FOR ALL TO authenticated
  USING (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR "tenant_id" IS NULL
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY "users_self_select" ON public.users
  FOR SELECT TO authenticated
  USING ("id" = NULLIF(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY "users_self_register" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    "id" = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND "tenant_id" IS NULL
    AND "role" = 'member'
  );
