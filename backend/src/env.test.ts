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
  PUBLIC_API_ORIGIN: 'https://api.example.test',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SENTRY_DSN: 'https://public@sentry.example.test/1',
  SENTRY_ENVIRONMENT: 'production',
  SENTRY_RELEASE: 'release-sha',
};

describe('environment contract', () => {
  it('requires production deployment dependencies', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      MAINTENANCE_DATABASE_URL: undefined,
      PUBLIC_API_ORIGIN: undefined,
      QSTASH_CURRENT_SIGNING_KEY: undefined,
      QSTASH_NEXT_SIGNING_KEY: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors)).toEqual(
        expect.arrayContaining([
          'MAINTENANCE_DATABASE_URL',
          'PUBLIC_API_ORIGIN',
          'QSTASH_CURRENT_SIGNING_KEY',
          'QSTASH_NEXT_SIGNING_KEY',
        ]),
      );
    }
  });

  it('accepts complete production deployment contract', () => {
    const result = envSchema.safeParse(baseProductionEnv);

    expect(result.success).toBe(true);
  });

  it('accepts Render commit as the production release fallback', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      SENTRY_RELEASE: undefined,
      RENDER_GIT_COMMIT: 'render-sha',
    });

    expect(result.success).toBe(true);
  });

  it('requires the public API URL to be an origin', () => {
    const result = envSchema.safeParse({
      ...baseProductionEnv,
      PUBLIC_API_ORIGIN: 'https://api.example.test/base',
    });

    expect(result.success).toBe(false);
  });
});
