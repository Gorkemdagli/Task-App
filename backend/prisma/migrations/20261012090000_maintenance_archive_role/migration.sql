DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskflow_maintenance') THEN
    CREATE ROLE taskflow_maintenance
      NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

DO $$
DECLARE
  maintenance_role oid;
BEGIN
  SELECT oid INTO maintenance_role FROM pg_roles WHERE rolname = 'taskflow_maintenance';

  -- Supabase grants this role to its provider administrators with ADMIN only.
  -- JSON keeps the guard compatible with PostgreSQL 15, which lacks SET/INHERIT options.
  IF EXISTS (
    SELECT 1 FROM pg_auth_members WHERE member = maintenance_role
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles member_role ON member_role.oid = m.member
    JOIN pg_roles grantor_role ON grantor_role.oid = m.grantor
    WHERE m.roleid = maintenance_role
      AND NOT (
        member_role.rolname IN ('postgres', 'supabase_admin')
        AND grantor_role.rolname IN ('postgres', 'supabase_admin')
        AND m.admin_option
        AND NOT COALESCE((to_jsonb(m)->>'inherit_option')::boolean, false)
        AND NOT COALESCE((to_jsonb(m)->>'set_option')::boolean, false)
      )
  ) THEN
    RAISE EXCEPTION 'taskflow_maintenance has an unsafe role membership';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relowner = maintenance_role AND relnamespace = 'public'::regnamespace
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspowner = maintenance_role AND nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'taskflow_maintenance must not own public objects';
  END IF;
END
$$;

ALTER ROLE taskflow_maintenance
  NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

REVOKE ALL ON SCHEMA public FROM taskflow_maintenance;
GRANT USAGE ON SCHEMA public TO taskflow_maintenance;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM taskflow_maintenance;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM taskflow_maintenance;
GRANT SELECT ("id") ON "tenants" TO taskflow_maintenance;
GRANT SELECT ("id", "tenant_id") ON "teams" TO taskflow_maintenance;
GRANT SELECT ("id", "team_id", "deadline", "archived_at"),
  UPDATE ("archived_at", "updated_at")
  ON "tasks" TO taskflow_maintenance;

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_archive_enumerate_tenants" ON "tenants"
  FOR SELECT TO taskflow_maintenance
  USING (true);

CREATE POLICY "maintenance_archive_read_teams" ON "teams"
  FOR SELECT TO taskflow_maintenance
  USING (
    "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY "maintenance_archive_read_tasks" ON "tasks"
  FOR SELECT TO taskflow_maintenance
  USING (
    EXISTS (
      SELECT 1
      FROM "teams" tm
      WHERE tm."id" = "tasks"."team_id"
        AND tm."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

CREATE POLICY "maintenance_archive_update_tasks" ON "tasks"
  FOR UPDATE TO taskflow_maintenance
  USING (
    "archived_at" IS NULL
    AND "deadline" IS NOT NULL
    AND "deadline" <= (
      date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      - INTERVAL '7 days'
    )
    AND EXISTS (
      SELECT 1
      FROM "teams" tm
      WHERE tm."id" = "tasks"."team_id"
        AND tm."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    "archived_at" IS NOT NULL
    AND "deadline" IS NOT NULL
    AND "deadline" <= (
      date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      - INTERVAL '7 days'
    )
    AND EXISTS (
      SELECT 1
      FROM "teams" tm
      WHERE tm."id" = "tasks"."team_id"
        AND tm."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );
