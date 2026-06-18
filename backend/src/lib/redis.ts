import Redis from 'ioredis';
import { env } from '../env';

declare global {
  // eslint-disable-next-line no-var
  var redisClient: Redis | undefined;
}

export const redis =
  global.redisClient ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (env.NODE_ENV !== 'production') {
  global.redisClient = redis;
}
