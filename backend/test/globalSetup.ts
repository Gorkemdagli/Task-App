import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import { execFileSync, execSync } from 'node:child_process';

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
}

export default async function setup() {
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
  const redisUrl = parsed.REDIS_URL ?? '';

  if (!dbUrl.includes('taskflow_test')) {
    fail(
      `\n❌ REFUSE TO RUN: backend/.env.test DATABASE_URL does not point at the test DB.\n` +
        `   Current: ${dbUrl || '(unset)'}\n` +
        `   Expected substring: taskflow_test (port 5433, isolated via docker-compose).\n`,
    );
  }
  if (!redisUrl.includes('6380')) {
    fail(
      `\n❌ REFUSE TO RUN: backend/.env.test REDIS_URL does not point at the test Redis.\n` +
        `   Current: ${redisUrl || '(unset)'}\n` +
        `   Expected: redis://localhost:6380 (docker-compose: redis-test).\n`,
    );
  }

  // Guard geçti → .env.test'i sürece yükle (override: outer shell DATABASE_URL
  // set etmiş olsa bile test DB kazanır).
  dotenv.config({ path: '.env.test', override: true, quiet: true });

  // eslint-disable-next-line no-console
  console.log(
    `✓ test DB guard ok — DATABASE_URL=${process.env.DATABASE_URL} REDIS_URL=${process.env.REDIS_URL}`,
  );

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

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    });
  } catch (err) {
    fail('\n❌ prisma migrate deploy failed against test DB');
  }
}
