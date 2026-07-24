import { PrismaClient, type Prisma } from '@prisma/client';
import { env } from '../env';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
}

// Runtime Prisma client APP_DATABASE_URL kullanır (no BYPASSRLS).
// Migration / script'ler DATABASE_URL (admin, BYPASSRLS) kullanır.
const datasourceUrl = env.APP_DATABASE_URL ?? env.DATABASE_URL;

// Event mode → stdout'a yazmak yerine $on ile logger'a yönlendir.
// LOG_LEVEL filtresi pino üzerinden geçerli olur.
const client =
  global.prismaClient ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

// $on overload'ları generated client'ın literal log config'inden çıkar.
// global cache literal type'ı ezdiği için açıkça aynı şekilde typed instance üret.
type EventClient = Omit<typeof client, '$on'> & {
  $on(event: 'query', handler: (e: Prisma.QueryEvent) => void): void;
  $on(event: 'warn' | 'error', handler: (e: Prisma.LogEvent) => void): void;
};

export const prisma = client as EventClient;

if (env.NODE_ENV !== 'production') global.prismaClient = prisma;

prisma.$on('query', (e: Prisma.QueryEvent) =>
  logger.debug(
    { query: e.query, params: e.params, duration: `${e.duration}ms` },
    'prisma:query',
  ),
);
prisma.$on('warn', (e: Prisma.LogEvent) =>
  logger.warn({ message: e.message }, 'prisma:warn'),
);
prisma.$on('error', (e: Prisma.LogEvent) =>
  logger.error({ message: e.message }, 'prisma:error'),
);
