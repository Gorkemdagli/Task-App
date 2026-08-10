import { z } from 'zod';
import * as dotenv from 'dotenv';

// Test ortamında .env.test, geliştirmede .env. NODE_ENV=test olmalı (vitest default).
// Override: TEST'te dışarıdan sızan DATABASE_URL'i eziyoruz → cleanDb() ana DB'ye
// dokunmasın. Dev/prod'da override YOK → k8s secrets, direnv vb. kazansın.
const isTest = process.env.NODE_ENV === 'test';
const envFile = isTest ? '.env.test' : '.env';
dotenv.config({ path: envFile, override: isTest });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    // Admin connection — Prisma migrations + setup/cleanup scripts (BYPASSRLS).
    DATABASE_URL: z.string().url(),
    // App connection — runtime (no BYPASSRLS, withTenantContext switches to authenticated).
    // Production'da Supabase authenticator pattern'iyle aynı: uygulama policy'lere tabi.
    APP_DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    CLIENT_URL: z.string().url(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.APP_DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_DATABASE_URL'],
        message: 'APP_DATABASE_URL is required in production',
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
