import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const baseProductionEnv = {
  NODE_ENV: 'production',
  PORT: '3001',
  DATABASE_URL: 'https://db.example.test/runtime',
  APP_DATABASE_URL: 'https://db.example.test/app',
  MAINTENANCE_DATABASE_URL: 'https://db.example.test/maintenance',
  REDIS_URL: 'rediss://redis.example.test:6379',
  JWT_ACCESS_SECRET: 'access-secret-long-enough',
  JWT_REFRESH_SECRET: 'refresh-secret-long-enough',
  CLIENT_URL: 'https://app.example.test',
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_TASK_FILES_BUCKET: 'taskflow-task-files',
  SENTRY_ENVIRONMENT: 'production',
};

describe('environment contract', () => {
  it('defaults runtime pool idle retention to 60 seconds', () => {
    const result = envSchema.safeParse(baseProductionEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RUNTIME_POOL_IDLE_TIMEOUT_MS).toBe(60_000);
    }
  });

  it('accepts the 10-second runtime pool idle rollback value', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      RUNTIME_POOL_IDLE_TIMEOUT_MS: '10000',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RUNTIME_POOL_IDLE_TIMEOUT_MS).toBe(10_000);
    }
  });

  it.each(['0', '-1', '1.5', 'not-a-number'])(
    'rejects invalid runtime pool idle timeout %s',
    (value) => {
      const result = envSchema.safeParse({
        ...baseProductionEnv,
        RUNTIME_POOL_IDLE_TIMEOUT_MS: value,
      });

      expect(result.success).toBe(false);
    },
  );

  it('requires production deployment dependencies', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      MAINTENANCE_DATABASE_URL: undefined,
      SUPABASE_TASK_FILES_BUCKET: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors)).toEqual(
        expect.arrayContaining([
          'MAINTENANCE_DATABASE_URL',
          'SUPABASE_TASK_FILES_BUCKET',
        ]),
      );
    }
  });

  it('accepts complete production deployment contract', () => {
    const result = envSchema.safeParse(baseProductionEnv);

    expect(result.success).toBe(true);
  });

  it('accepts blank optional Sentry placeholders in production', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      SENTRY_DSN: '',
      SENTRY_RELEASE: '',
    });

    expect(result.success).toBe(true);
  });

  it('defaults to the existing Supabase storage provider', () => {
    const result = envSchema.safeParse(baseProductionEnv);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.STORAGE_PROVIDER).toBe('supabase');
  });

  it('allows a local-storage production install without Supabase credentials', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      STORAGE_PROVIDER: 'local',
      PUBLIC_API_ORIGIN: 'https://api.example.test',
      LOCAL_STORAGE_ROOT: '/var/lib/taskflow-storage',
      LOCAL_STORAGE_SIGNING_SECRET: 'random-local-signing-secret-with-32-bytes',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_TASK_FILES_BUCKET: undefined,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    [{ STORAGE_PROVIDER: 'local', LOCAL_STORAGE_ROOT: undefined }, 'LOCAL_STORAGE_ROOT'],
    [{ STORAGE_PROVIDER: 'local', LOCAL_STORAGE_ROOT: 'relative/storage' }, 'LOCAL_STORAGE_ROOT'],
    [{ STORAGE_PROVIDER: 'local', LOCAL_STORAGE_ROOT: '/var/lib/taskflow-storage' }, 'LOCAL_STORAGE_SIGNING_SECRET'],
    [{ STORAGE_PROVIDER: 'local', LOCAL_STORAGE_ROOT: '/var/lib/taskflow-storage', LOCAL_STORAGE_SIGNING_SECRET: 'short' }, 'LOCAL_STORAGE_SIGNING_SECRET'],
    [{ STORAGE_PROVIDER: 'local', LOCAL_STORAGE_ROOT: '/var/lib/taskflow-storage', LOCAL_STORAGE_SIGNING_SECRET: 'random-local-signing-secret-with-32-bytes', PUBLIC_API_ORIGIN: undefined }, 'PUBLIC_API_ORIGIN'],
    [{ STORAGE_PROVIDER: 'local', LOCAL_STORAGE_ROOT: '/var/lib/taskflow-storage', LOCAL_STORAGE_SIGNING_SECRET: 'random-local-signing-secret-with-32-bytes', PUBLIC_API_ORIGIN: 'https://api.example.test/base' }, 'PUBLIC_API_ORIGIN'],
  ])('rejects missing or invalid local storage settings', (override, field) => {
    const result = envSchema.safeParse({ ...baseProductionEnv, ...override });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toHaveProperty(field);
    }
  });

  it('keeps Supabase production credentials required in the default mode', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_TASK_FILES_BUCKET: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors)).toEqual(
        expect.arrayContaining([
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
          'SUPABASE_TASK_FILES_BUCKET',
        ]),
      );
    }
  });

  it('accepts Render commit as the production release fallback', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      SENTRY_RELEASE: undefined,
      RENDER_GIT_COMMIT: 'render-sha',
    });

    expect(result.success).toBe(true);
  });

  it('does not require a public API origin for Supabase storage', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      PUBLIC_API_ORIGIN: 'https://api.example.test/base',
    });

    expect(result.success).toBe(true);
  });
});
