-- ============================================================
-- TaskFlow Faz 1 — RLS Verification (single batch, Results tab)
-- ============================================================
-- Tum script'i tek seferde calistir. Tek Results tab ciktisi:
--   test                        | visible_tasks | expected | result
--   TEST 1: Tenant A            |             1 |        1 | PASS
--   TEST 2: Tenant B            |             1 |        1 | PASS
--   TEST 3: Eslesmeyen tenant   |             0 |        0 | PASS
-- ============================================================

DO $$
DECLARE
  tenant_a_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  tenant_b_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  user_a_id   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  user_b_id   uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  team_a_id   uuid := 'aaaaaaaa-0000-0000-0000-0000000000e1';
  team_b_id   uuid := 'bbbbbbbb-0000-0000-0000-0000000000e1';
  task_a_id   uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';
  task_b_id   uuid := 'bbbbbbbb-0000-0000-0000-0000000000b1';
  count_a int;
  count_b int;
  count_none int;
BEGIN
  -- Setup: 2 tenant + 2 user + 2 team + 2 task
  DELETE FROM tasks WHERE id IN (task_a_id, task_b_id);
  DELETE FROM teams WHERE id IN (team_a_id, team_b_id);
  DELETE FROM users WHERE id IN (user_a_id, user_b_id);
  DELETE FROM tenants WHERE id IN (tenant_a_id, tenant_b_id);

  INSERT INTO tenants (id, name, slug, updated_at) VALUES
    (tenant_a_id, 'Test Tenant A', 'test-a-verify', now()),
    (tenant_b_id, 'Test Tenant B', 'test-b-verify', now());

  INSERT INTO users (id, tenant_id, email, full_name, role, updated_at) VALUES
    (user_a_id, tenant_a_id, 'usera-verify@test.com', 'User A', 'companyAdmin', now()),
    (user_b_id, tenant_b_id, 'userb-verify@test.com', 'User B', 'companyAdmin', now());

  INSERT INTO teams (id, tenant_id, name, updated_at) VALUES
    (team_a_id, tenant_a_id, 'Team A', now()),
    (team_b_id, tenant_b_id, 'Team B', now());

  INSERT INTO tasks (id, team_id, title, status, priority, assigner_id, assignee_id, updated_at) VALUES
    (task_a_id, team_a_id, 'Task in A', 'todo', 'medium', user_a_id, user_a_id, now()),
    (task_b_id, team_b_id, 'Task in B', 'todo', 'medium', user_b_id, user_b_id, now());

  -- authenticated rolune gec (RLS aktif olur)
  SET ROLE authenticated;

  -- Test 1: Tenant A context → 1 task (A'nin)
  PERFORM set_config('app.tenant_id', tenant_a_id::text, false);
  SELECT count(*) INTO count_a FROM tasks WHERE id IN (task_a_id, task_b_id);

  -- Test 2: Tenant B context → 1 task (B'nin)
  PERFORM set_config('app.tenant_id', tenant_b_id::text, false);
  SELECT count(*) INTO count_b FROM tasks WHERE id IN (task_a_id, task_b_id);

  -- Test 3: Eslesmeyen tenant → 0 task (RLS deny)
  PERFORM set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', false);
  SELECT count(*) INTO count_none FROM tasks WHERE id IN (task_a_id, task_b_id);

  -- Superuser'a don
  RESET ROLE;

  -- Cleanup
  DELETE FROM tasks WHERE id IN (task_a_id, task_b_id);
  DELETE FROM teams WHERE id IN (team_a_id, team_b_id);
  DELETE FROM users WHERE id IN (user_a_id, user_b_id);
  DELETE FROM tenants WHERE id IN (tenant_a_id, tenant_b_id);

  -- Temp table — DO blogu disinda SELECT ile okunacak
  CREATE TEMP TABLE verify_results AS
    SELECT 'TEST 1: Tenant A' AS test, count_a AS visible_tasks, 1 AS expected, CASE WHEN count_a = 1 THEN 'PASS' ELSE 'FAIL' END AS result
    UNION ALL
    SELECT 'TEST 2: Tenant B', count_b, 1, CASE WHEN count_b = 1 THEN 'PASS' ELSE 'FAIL' END
    UNION ALL
    SELECT 'TEST 3: Eslesmeyen', count_none, 0, CASE WHEN count_none = 0 THEN 'PASS' ELSE 'FAIL' END;
END $$;

-- DO blogu disinda SELECT — Results tab'da gosterilir
SELECT * FROM verify_results ORDER BY test;

DROP TABLE verify_results;
