import rateLimit, { type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { performance } from 'node:perf_hooks';
import RedisStore, { type SendCommandFn } from 'rate-limit-redis';
import { redis } from '../lib/redis';
import type { RequestTimingRecorder } from '../http/requestTiming';

interface CreateRateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: Options['keyGenerator'];
}

export function createRateLimit(opts: CreateRateLimitOptions) {
  const limiter = rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    keyGenerator: opts.keyGenerator,
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

  return ((req, res, next) => {
    const timing = req.requestTiming as RequestTimingRecorder | undefined;
    if (!timing) return limiter(req, res, next);

    const started = performance.now();
    try {
      timing.observeDiagnosticStage?.('start', 'rate_limit_ms');
    } catch {
      // Diagnostic observers must not change rate limiting.
    }
    let recorded = false;
    const finish = () => {
      if (recorded) return;
      recorded = true;
      res.off('prefinish', finish);
      res.off('finish', finish);
      res.off('close', finish);
      const elapsedMs = performance.now() - started;
      timing.record('rate_limit_ms', elapsedMs);
      try {
        timing.observeDiagnosticStage?.('end', 'rate_limit_ms', elapsedMs);
      } catch {
        // Diagnostic observers must not change rate limiting.
      }
    };
    res.once('prefinish', finish);
    res.once('finish', finish);
    res.once('close', finish);

    try {
      return limiter(req, res, (error) => {
        finish();
        next(error);
      });
    } catch (error) {
      finish();
      return next(error);
    }
  }) as RequestHandler;
}
