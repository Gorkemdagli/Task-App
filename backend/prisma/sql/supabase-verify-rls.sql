-- ============================================================
-- TaskFlow Faz 1 — RLS Verification
-- ============================================================
-- Kullanim: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Cikti: Messages tab'inda 3 test sonucu (PASS/FAIL)
--
-- Bu script authenticated rolune gecerek RLS'in gercekten
-- uygulandigini kanitlar. SQL Editor normalde superuser olarak
-- calisir (RLS bypass). SET ROLE authenticated ile RLS aktif olur.
-- ============================================================

DO $$
DECLARE
  -- Sabit test UUID'leri (her calistirmada ayni, idempotent)
  tenant_a_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  tenant_b_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  user_a_id   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  user_b_id   uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  team_a_id   uuid := 'aaaaaaaa-0000-0000-0000-0000000000e1';
  team_b_id   uuid := 'bbbbbbbb-0000-0000-0000-0000000000e1';
  task_a_id   uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';
  task_b_id   uuid := 'bbbbbbbb-0000-0000-0000-0000000000b1';
  -- Sayimlar
  count_a int;
  count_b int;
  count_none int;
  -- Sonuc
  pass_count int := 0;
  fail_count int := 0;
BEGIN
  -- ============================================================
  -- SETUP: 2 tenant + 2 user + 2 team + 2 task
  -- ON DELETE CASCADE olmadigi icin (RLS olabilir) once temizle
  -- ============================================================
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

  -- ============================================================
  -- TEST: authenticated rolune gec (RLS uygulanir)
  -- ============================================================
  SET ROLE authenticated;

  -- Test 1: Tenant A context → sadece 1 task (A'nin)
  -- NOT: PL/pgSQL icinde SET LOCAL expression kabul etmez, set_config() kullan.
  PERFORM set_config('app.tenant_id', tenant_a_id::text, true);
  SELECT count(*) INTO count_a FROM tasks WHERE id IN (task_a_id, task_b_id);
  IF count_a = 1 THEN
    RAISE NOTICE 'TEST 1 PASS: Tenant A context = % (beklenen 1)', count_a;
    pass_count := pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 1 FAIL: Tenant A context = % (beklenen 1)', count_a;
    fail_count := fail_count + 1;
  END IF;

  -- Test 2: Tenant B context → sadece 1 task (B'nin)
  PERFORM set_config('app.tenant_id', tenant_b_id::text, true);
  SELECT count(*) INTO count_b FROM tasks WHERE id IN (task_a_id, task_b_id);
  IF count_b = 1 THEN
    RAISE NOTICE 'TEST 2 PASS: Tenant B context = % (beklenen 1)', count_b;
    pass_count := pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 2 FAIL: Tenant B context = % (beklenen 1)', count_b;
    fail_count := fail_count + 1;
  END IF;

  -- Test 3: Eslesmeyen tenant_id → 0 task (RLS deny)
  -- NOT: RESET app.tenant_id empty string set eder, uuid cast hata verir.
  -- Bunun yerine eslesmeyen valid UUID kullan.
  PERFORM set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true);
  SELECT count(*) INTO count_none FROM tasks WHERE id IN (task_a_id, task_b_id);
  IF count_none = 0 THEN
    RAISE NOTICE 'TEST 3 PASS: Eslesmeyen tenant = % (beklenen 0)', count_none;
    pass_count := pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 3 FAIL: Eslesmeyen tenant = % (beklenen 0)', count_none;
    fail_count := fail_count + 1;
  END IF;

  -- Reset role (superuser'a don)
  RESET ROLE;

  -- ============================================================
  -- CLEANUP
  -- ============================================================
  DELETE FROM tasks WHERE id IN (task_a_id, task_b_id);
  DELETE FROM teams WHERE id IN (team_a_id, team_b_id);
  DELETE FROM users WHERE id IN (user_a_id, user_b_id);
  DELETE FROM tenants WHERE id IN (tenant_a_id, tenant_b_id);

  RAISE NOTICE '';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'SONUC: % PASS, % FAIL', pass_count, fail_count;
  RAISE NOTICE '=================================================';
  IF fail_count > 0 THEN
    RAISE EXCEPTION 'RLS verification BASARISIZ. Yukaridaki FAIL mesajlarini incele.';
  END IF;
END $$;

-- ============================================================
-- Dogrulama sorgulari (RLS basariyla uygulandiktan sonra calistir)
-- ============================================================

-- 9 tabloda RLS enable mi?
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 9 RLS policy var mi?
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- CHECK constraint var mi?
SELECT conname, contype
FROM pg_constraint
WHERE conname = 'messages_channel_or_receiver_check';
