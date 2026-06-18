import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export const healthRouter = Router();

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

healthRouter.get('/', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => 'up' as const)
      .catch(() => 'down' as const),
    redis
      .ping()
      .then((r) => (r === 'PONG' ? 'up' as const : 'down' as const))
      .catch(() => 'down' as const),
  ]);

  const response: HealthResponse = {
    status: dbOk === 'up' && redisOk === 'up' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbOk,
      redis: redisOk,
    },
  };

  const statusCode = response.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(response);
});