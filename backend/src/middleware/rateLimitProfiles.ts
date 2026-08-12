import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { createRateLimit } from './rateLimit';

export const RATE_LIMIT_PROFILES = {
  register: { windowMs: 60_000, max: 5, keyPrefix: 'rl:register:' },
  login: { windowMs: 60_000, max: 10, keyPrefix: 'rl:login:' },
  refresh: { windowMs: 60_000, max: 30, keyPrefix: 'rl:refresh:' },
  authenticatedRead: { windowMs: 60_000, max: 120, keyPrefix: 'rl:read:' },
  write: { windowMs: 60_000, max: 30, keyPrefix: 'rl:write:' },
  upload: { windowMs: 60_000, max: 10, keyPrefix: 'rl:upload:' },
} as const;

export type RateLimitProfileName = keyof typeof RATE_LIMIT_PROFILES;

const publicKey = (req: Request): string => `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;

const actorKey = (req: Request): string => (req.user?.id ? `user:${req.user.id}` : publicKey(req));

export const registerLimiter = createRateLimit({
  ...RATE_LIMIT_PROFILES.register,
  keyGenerator: publicKey,
});

export const loginLimiter = createRateLimit({
  ...RATE_LIMIT_PROFILES.login,
  keyGenerator: publicKey,
});

export const refreshLimiter = createRateLimit({
  ...RATE_LIMIT_PROFILES.refresh,
  keyGenerator: publicKey,
});

export const authenticatedReadLimiter = createRateLimit({
  ...RATE_LIMIT_PROFILES.authenticatedRead,
  keyGenerator: actorKey,
});

export const writeLimiter = createRateLimit({
  ...RATE_LIMIT_PROFILES.write,
  keyGenerator: actorKey,
});

export const uploadLimiter = createRateLimit({
  ...RATE_LIMIT_PROFILES.upload,
  keyGenerator: actorKey,
});
