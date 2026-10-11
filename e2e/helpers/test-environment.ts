import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const backendRequire = createRequire(resolve(process.cwd(), 'backend/package.json'));
const { parse } = backendRequire('dotenv') as { parse(input: string): Record<string, string> };

function guardedTestEnvironment() {
  const env = parse(readFileSync(resolve(process.cwd(), 'backend/.env.test'), 'utf8'));
  const check = (value: string | undefined, name: string, port: number, database?: string) => {
    if (!value) throw new Error(`${name} is required in backend/.env.test`);
    const url = new URL(value);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== String(port) ||
      (database && url.pathname !== `/${database}`)
    ) {
      throw new Error(`${name} must target the local TaskFlow E2E test service`);
    }
    return value;
  };

  const databaseUrl = check(env.DATABASE_URL, 'DATABASE_URL', 5433, 'taskflow_test');
  if (env.APP_DATABASE_URL) check(env.APP_DATABASE_URL, 'APP_DATABASE_URL', 5433, 'taskflow_test');
  const redisUrl = check(env.REDIS_URL, 'REDIS_URL', 6380);
  return { databaseUrl, redisUrl };
}

export function guardedTestDatabaseUrl() {
  return guardedTestEnvironment().databaseUrl;
}

export async function resetFixtureRegistrationLimit() {
  const { redisUrl } = guardedTestEnvironment();
  const Redis = backendRequire('ioredis') as new (url: string) => {
    del(key: string): Promise<number>;
    quit(): Promise<string>;
  };
  const redis = new Redis(redisUrl);
  try {
    await redis.del('rl:register:ip:127.0.0.1');
  } finally {
    await redis.quit();
  }
}
