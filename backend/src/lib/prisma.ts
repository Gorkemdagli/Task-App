import { PrismaClient } from '@prisma/client';
import { env } from '../env';

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
}

// Runtime Prisma client APP_DATABASE_URL kullanır (no BYPASSRLS).
// Migration / script'ler DATABASE_URL (admin, BYPASSRLS) kullanır.
const datasourceUrl = env.APP_DATABASE_URL ?? env.DATABASE_URL;

export const prisma =
  global.prismaClient ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.prismaClient = prisma;
}
