import { z } from 'zod';
import * as dotenv from 'dotenv';

// Test ortamında .env.test, geliştirmede .env. NODE_ENV=test olmalı (vitest default).
// Override: TEST'te dışarıdan sızan DATABASE_URL'i eziyoruz → cleanDb() ana DB'ye
// dokunmasın. Dev/prod'da override YOK → k8s secrets, direnv vb. kazansın.
const isTest = process.env.NODE_ENV === 'test';
const envFile = isTest ? '.env.test' : '.env';
dotenv.config({ path: envFile, override: isTest, quiet: true });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    // Admin connection — Prisma migrations + setup/cleanup scripts (BYPASSRLS).
    DATABASE_URL: z.string().url(),
    // App connection — runtime (no BYPASSRLS, withTenantContext switches to authenticated).
    // Production'da Supabase authenticator pattern'iyle aynı: uygulama policy'lere tabi.
    APP_DATABASE_URL: z.string().url().optional(),
    MAINTENANCE_DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    CLIENT_URL: z.string().url(),
    PUBLIC_API_ORIGIN: z.string().url().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().min(1).default('development'),
    SENTRY_RELEASE: z.string().min(1).optional(),
    RENDER_GIT_COMMIT: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
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
    if (value.NODE_ENV === 'production' && !value.PUBLIC_API_ORIGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_API_ORIGIN'],
        message: 'PUBLIC_API_ORIGIN is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.PUBLIC_API_ORIGIN) {
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
    for (const key of ['QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY'] as const) {
      if (value.NODE_ENV === 'production' && !value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
    if (value.NODE_ENV === 'production' && !value.SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message: 'SUPABASE_SERVICE_ROLE_KEY is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.SENTRY_DSN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SENTRY_DSN'],
        message: 'SENTRY_DSN is required in production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.SENTRY_RELEASE && !value.RENDER_GIT_COMMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SENTRY_RELEASE'],
        message: 'SENTRY_RELEASE or RENDER_GIT_COMMIT is required in production',
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
