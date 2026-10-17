import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { env } from '../env';
import { logger } from './logger';

type RuntimePoolCounters = {
  connectCount: number;
  acquireCount: number;
  removeCount: number;
};

type RuntimePrismaState = {
  pool: Pool;
  counters?: RuntimePoolCounters;
  client?: PrismaClient;
};

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaLoggingClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaRuntime: RuntimePrismaState | undefined;
}

// Runtime Prisma client APP_DATABASE_URL kullanır (no BYPASSRLS).
// Migration / script'ler DATABASE_URL (admin, BYPASSRLS) kullanır.
const datasourceUrl =
  env.NODE_ENV === 'production' ? env.APP_DATABASE_URL : (env.APP_DATABASE_URL ?? env.DATABASE_URL);

if (!datasourceUrl) {
  throw new Error('APP_DATABASE_URL is required for the production runtime');
}

function createRuntimeState(): RuntimePrismaState {
  const pool = new Pool({
    connectionString: datasourceUrl,
    idleTimeoutMillis: env.RUNTIME_POOL_IDLE_TIMEOUT_MS,
  });
  const counters = env.REQUEST_STAGE_TIMING
    ? { connectCount: 0, acquireCount: 0, removeCount: 0 }
    : undefined;

  if (counters) {
    pool.on('connect', () => counters.connectCount++);
    pool.on('acquire', () => counters.acquireCount++);
    pool.on('remove', () => counters.removeCount++);
  }

  return { pool, counters };
}

const runtimeState =
  env.NODE_ENV !== 'production' ? (global.prismaRuntime ?? createRuntimeState()) : createRuntimeState();
const client =
  runtimeState.client ??
  new PrismaClient({
    adapter: new PrismaPg(runtimeState.pool, { disposeExternalPool: true }),
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });
runtimeState.client = client;

// $on overload'ları generated client'ın literal log config'inden çıkar.
// global cache literal type'ı ezdiği için açıkça aynı şekilde typed instance üret.
type EventClient = Omit<typeof client, '$on'> & {
  $on(event: 'query', handler: (e: Prisma.QueryEvent) => void): PrismaClient;
  $on(event: 'warn' | 'error', handler: (e: Prisma.LogEvent) => void): PrismaClient;
};

export const prisma = client as EventClient;

if (env.NODE_ENV !== 'production') {
  global.prismaRuntime = runtimeState;
  global.prismaClient = prisma;
}

// Event counts are cumulative process totals; do not interpret their change as request-owned.
export function getRuntimePoolSnapshot() {
  return {
    totalCount: runtimeState.pool.totalCount,
    idleCount: runtimeState.pool.idleCount,
    waitingCount: runtimeState.pool.waitingCount,
    connectCount: runtimeState.counters?.connectCount ?? 0,
    acquireCount: runtimeState.counters?.acquireCount ?? 0,
    removeCount: runtimeState.counters?.removeCount ?? 0,
  };
}

if (global.prismaLoggingClient !== prisma) {
  prisma.$on('query', (e: Prisma.QueryEvent) => {
    const metadata =
      env.NODE_ENV === 'production'
        ? { duration: e.duration, target: e.target }
        : { query: e.query, params: e.params, duration: `${e.duration}ms`, target: e.target };
    logger.debug(metadata, 'prisma:query');
  });
  prisma.$on('warn', (e: Prisma.LogEvent) => logger.warn({ message: e.message }, 'prisma:warn'));
  prisma.$on('error', (e: Prisma.LogEvent) => logger.error({ message: e.message }, 'prisma:error'));
  global.prismaLoggingClient = prisma;
}
