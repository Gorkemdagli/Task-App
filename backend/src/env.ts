import { z } from 'zod';
import * as dotenv from 'dotenv';
import path from 'node:path';

// Test ortamında .env.test, geliştirmede .env. NODE_ENV=test olmalı (vitest default).
// Override: TEST'te dışarıdan sızan DATABASE_URL'i eziyoruz → cleanDb() ana DB'ye
// dokunmasın. Dev/prod'da override YOK → k8s secrets, direnv vb. kazansın.
const isTest = process.env.NODE_ENV === 'test';
const envFile = isTest ? '.env.test' : '.env';
dotenv.config({ path: envFile, override: isTest, quiet: true });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    STORAGE_PROVIDER: z.enum(['supabase', 'local']).default('supabase'),
    LOCAL_STORAGE_ROOT: z.string().optional(),
    LOCAL_STORAGE_SIGNING_SECRET: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3001),
    // Admin connection — Prisma migrations + setup/cleanup scripts (BYPASSRLS).
    DATABASE_URL: z.string().url(),
    // App connection — runtime (no BYPASSRLS, withTenantContext switches to authenticated).
    // Production'da Supabase authenticator pattern'iyle aynı: uygulama policy'lere tabi.
    APP_DATABASE_URL: z.string().url().optional(),
    MAINTENANCE_DATABASE_URL: z.string().url().optional(),
    RUNTIME_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    CLIENT_URL: z.string().url(),
    PUBLIC_API_ORIGIN: z.string().url().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    REQUEST_STAGE_TIMING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SUPABASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
    SUPABASE_SERVICE_ROLE_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    SUPABASE_TASK_FILES_BUCKET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    SENTRY_DSN: z.preprocess((value) => (value === '' ? undefined : value), z.string().url().optional()),
    SENTRY_ENVIRONMENT: z.string().min(1).default('development'),
    SENTRY_RELEASE: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
    RENDER_GIT_COMMIT: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_PROVIDER === 'local') {
      if (!value.LOCAL_STORAGE_ROOT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LOCAL_STORAGE_ROOT'],
          message: 'LOCAL_STORAGE_ROOT is required for local storage',
        });
      } else if (!path.isAbsolute(value.LOCAL_STORAGE_ROOT)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LOCAL_STORAGE_ROOT'],
          message: 'LOCAL_STORAGE_ROOT must be absolute',
        });
      }
      if (
        !value.LOCAL_STORAGE_SIGNING_SECRET ||
        Buffer.byteLength(value.LOCAL_STORAGE_SIGNING_SECRET, 'utf8') < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LOCAL_STORAGE_SIGNING_SECRET'],
          message: 'LOCAL_STORAGE_SIGNING_SECRET must contain at least 32 characters for local storage',
        });
      }
      if (!value.PUBLIC_API_ORIGIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PUBLIC_API_ORIGIN'],
          message: 'PUBLIC_API_ORIGIN is required for local storage',
        });
      } else {
        try {
          const origin = new URL(value.PUBLIC_API_ORIGIN);
          if (
            !['http:', 'https:'].includes(origin.protocol) ||
            origin.href !== `${origin.origin}/` ||
            origin.search ||
            origin.hash ||
            origin.username ||
            origin.password
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['PUBLIC_API_ORIGIN'],
              message: 'PUBLIC_API_ORIGIN must be an absolute origin for local storage',
            });
          }
        } catch {
          // The URL schema reports malformed values.
        }
      }
    }
    if (value.NODE_ENV === 'production' && !value.APP_DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_DATABASE_URL'],
        message: 'APP_DATABASE_URL is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.MAINTENANCE_DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAINTENANCE_DATABASE_URL'],
        message: 'MAINTENANCE_DATABASE_URL is required in production',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.STORAGE_PROVIDER === 'local' &&
      value.PUBLIC_API_ORIGIN
    ) {
      const publicApiOrigin = new URL(value.PUBLIC_API_ORIGIN);
      if (
        publicApiOrigin.protocol !== 'https:' ||
        publicApiOrigin.pathname !== '/' ||
        publicApiOrigin.search ||
        publicApiOrigin.hash ||
        publicApiOrigin.username ||
        publicApiOrigin.password
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PUBLIC_API_ORIGIN'],
          message: 'PUBLIC_API_ORIGIN must be an HTTPS origin in production',
        });
      }
    }
    if (value.NODE_ENV === 'production' && value.STORAGE_PROVIDER === 'supabase' && !value.SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.STORAGE_PROVIDER === 'supabase' && !value.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message: 'SUPABASE_SERVICE_ROLE_KEY is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.STORAGE_PROVIDER === 'supabase' && !value.SUPABASE_TASK_FILES_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_TASK_FILES_BUCKET'],
        message: 'SUPABASE_TASK_FILES_BUCKET is required in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
