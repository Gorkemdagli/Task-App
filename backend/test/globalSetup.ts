import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as dotenv from 'dotenv';
import { execFileSync, execSync } from 'node:child_process';

type GlobalSetupProject = { provide(key: string, value: unknown): void };

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const postgresTargetOverrides = new Set([
  'host',
  'hostaddr',
  'port',
  'dbname',
  'database',
  'db',
  'service',
  'servicefile',
  'options',
  'target_session_attrs',
]);

export function isLocalTestDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      loopbackHosts.has(url.hostname.toLowerCase()) &&
      url.port === '5433' &&
      url.pathname === '/taskflow_test' &&
      !url.hash &&
      ![...url.searchParams.keys()].some((key) => postgresTargetOverrides.has(key.toLowerCase()))
    );
  } catch {
    return false;
  }
}

export function isLocalTestRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'redis:' &&
      loopbackHosts.has(url.hostname.toLowerCase()) &&
      url.port === '6380' &&
      (url.pathname === '' || url.pathname === '/') &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
}

function removeTaskflowAppRole() {
  const exists = execFileSync(
    'docker',
    [
      'exec',
      'taskflow-postgres-test',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atc',
      "SELECT 1 FROM pg_roles WHERE rolname='taskflow_app'",
    ],
    { encoding: 'utf8' },
  ).trim();
  if (exists !== '1') return;
  execFileSync(
    'docker',
    ['exec', '-i', 'taskflow-postgres-test', 'psql', '-U', 'postgres', '-d', 'taskflow_test', '-v', 'ON_ERROR_STOP=1'],
    { input: 'DROP OWNED BY taskflow_app;' },
  );
  execFileSync(
    'docker',
    ['exec', '-i', 'taskflow-postgres-test', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: 'REVOKE authenticated FROM taskflow_app; DROP ROLE taskflow_app;' },
  );
}

export default async function setup(project: GlobalSetupProject) {
  // Vitest globalSetup: tüm testlerden ÖNCE bir kez çalışır.
  // Görevi: ortam değişkenlerini yükle, test DB'ye bağlantıyı doğrula,
  // aksi halde süreci çökert. cleanDb() vb. ana DB'yi silemesin diye son savunma.

  // .env.test dosyasından DATABASE_URL/REDIS_URL'u parse et, override etmeden ÖNCE
  // doğrula. Biri .env.test'i dev DB'ye yönlendirse guard burada yakalar.
  if (!fs.existsSync('.env.test')) {
    fail('\n❌ REFUSE TO RUN: backend/.env.test missing. Tests cannot start.\n');
  }
  const rawEnv = fs.readFileSync('.env.test', 'utf8');
  const parsed = dotenv.parse(rawEnv);
  const dbUrl = parsed.DATABASE_URL ?? '';
  const directUrl = parsed.DIRECT_URL ?? dbUrl;
  const redisUrl = parsed.REDIS_URL ?? '';

  if (!isLocalTestDatabaseUrl(dbUrl) || !isLocalTestDatabaseUrl(directUrl)) {
    fail('\nREFUSE TO RUN: DATABASE_URL and DIRECT_URL must target local taskflow_test on port 5433.\n');
  }
  if (!isLocalTestRedisUrl(redisUrl)) {
    fail('\nREFUSE TO RUN: REDIS_URL must target the local test Redis on port 6380.\n');
  }

  // Guard geçti → .env.test'i sürece yükle (override: outer shell DATABASE_URL
  // set etmiş olsa bile test DB kazanır).
  dotenv.config({ path: '.env.test', override: true, quiet: true });

  // eslint-disable-next-line no-console
  console.log('test DB and Redis guards ok');

  // Test container'ları ayakta mı? docker compose up -d ile idempotent start.
  // compose up zaten ayakta olan container'ı atlar; sadece düşmüş olanları kaldırır.
  // Çalışma dizini: globalSetup backend/ içinde çalışır, compose root bir üst.
  try {
    execSync('docker compose up -d postgres-test redis-test', {
      stdio: 'inherit',
      cwd: '..',
    });
  } catch (err) {
    fail('\n❌ docker compose up failed. Is Docker daemon running?');
  }

  // Container'lar healthy olana kadar bekle. healthcheck 5s interval ile çalışır.
  // 30s yetmiyor → fail fast, kullanıcı docker log'larına baksın.
  const composeRoot = '..';
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const out = execSync(
        `docker inspect --format='{{.State.Health.Status}}' taskflow-postgres-test taskflow-redis-test`,
        { cwd: composeRoot, encoding: 'utf8' },
      );
      const statuses = out
        .trim()
        .split('\n')
        .map((s) => s.replace(/['\s]/g, ''));
      if (statuses.every((s) => s === 'healthy' || s === 'running')) {
        // eslint-disable-next-line no-console
        console.log('✓ test containers healthy');
        break;
      }
    } catch {
      // inspect failed → container still starting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (Date.now() >= deadline) {
    fail('\n❌ test containers did not become healthy within 30s');
  }

  // DB şemasını bir kere apply et. cleanDb() tabloları temizler; migrate deploy
  // idempotent. Postgres-test container ilk ayağa kalktığında tablo yok.
  //
  // Önce Supabase uyumlu rolleri oluştur — RLS policy'leri `authenticated`
  // rolüne atanmış; plain postgres container'da rol yok, migrate deploy patlar.
  // Test DB ephemeral. Her test run'da sıfırdan kur: rol → drop db → recreate db →
  // migrate deploy. Yarıda kalmış migration state'leri bir sonraki run'ı kirletir.
  try {
    execFileSync(
      'docker',
      [
        'exec',
        'taskflow-postgres-test',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;",
      ],
      { stdio: 'inherit' },
    );
    execSync(
      `docker exec taskflow-postgres-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='taskflow_test' AND pid <> pg_backend_pid();"`,
      { stdio: 'inherit' },
    );
    execSync(
      `docker exec taskflow-postgres-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS taskflow_test;"`,
      { stdio: 'inherit' },
    );
    execSync(
      `docker exec taskflow-postgres-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE taskflow_test OWNER postgres;"`,
      { stdio: 'inherit' },
    );
  } catch (err) {
    fail('\n❌ Could not reset test DB / bootstrap Supabase roles. Is taskflow-postgres-test up?');
  }

  const taskflowAppPassword = randomBytes(32).toString('base64url');
  const taskflowAppRoleSql = `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname='taskflow_app') THEN REVOKE authenticated FROM taskflow_app; DROP ROLE taskflow_app; END IF; END $$;
CREATE ROLE taskflow_app LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${taskflowAppPassword}';
GRANT authenticated TO taskflow_app;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='taskflow_app' AND rolcanlogin AND NOT rolinherit AND NOT rolbypassrls AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) THEN RAISE EXCEPTION 'taskflow_app has unsafe attributes'; END IF; IF NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='authenticated' AND u.rolname='taskflow_app' AND COALESCE((to_jsonb(m)->>'set_option')::boolean, true)) THEN RAISE EXCEPTION 'taskflow_app cannot SET ROLE authenticated'; END IF; END $$;`;
  try {
    execFileSync(
      'docker',
      ['exec', '-i', 'taskflow-postgres-test', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { input: taskflowAppRoleSql },
    );
    project.provide('taskflowAppPassword', taskflowAppPassword);
  } catch (err) {
    removeTaskflowAppRole();
    fail('\nCould not create restricted taskflow_app test role.');
  }

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: directUrl },
    });
  } catch (err) {
    removeTaskflowAppRole();
    fail('\n❌ prisma migrate deploy failed against test DB');
  }

  return async () => {
    removeTaskflowAppRole();
  };
}
