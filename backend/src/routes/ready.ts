import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export const readyRouter = Router();

readyRouter.get('/', async (_req, res) => {
  const [database, redisStatus] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => 'up' as const).catch(() => 'down' as const),
    redis
      .ping()
      .then((response) => (response === 'PONG' ? ('up' as const) : ('down' as const)))
      .catch(() => 'down' as const),
  ]);

  const ready = database === 'up' && redisStatus === 'up';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    services: { database, redis: redisStatus },
  });
});
