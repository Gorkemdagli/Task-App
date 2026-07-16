import rateLimit from 'express-rate-limit';
import RedisStore, { type SendCommandFn } from 'rate-limit-redis';
import { redis } from '../lib/redis';

export function createRateLimit(opts: { windowMs: number; max: number; keyPrefix: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
      // ioredis `call` returns `Promise<unknown>`; rate-limit-redis expects
      // `Promise<RedisReply>`. Wire format matches — forward raw responses.
      // Cast via the library's exported `SendCommandFn` instead of `as never`,
      // so a future type change surfaces here, not silently.
      sendCommand: ((...args: string[]) =>
        redis.call(...(args as [string, ...string[]]))) as unknown as SendCommandFn,
      prefix: opts.keyPrefix,
    }),
    handler: (_req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Çok fazla deneme. Lütfen 1 dakika bekleyin.',
        retryAfter: 60,
      });
    },
  });
}
