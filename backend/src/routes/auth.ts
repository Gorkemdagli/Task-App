import { Router } from 'express';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { validateBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import * as authService from '../services/auth.service';
import { setRefreshCookie, clearRefreshCookie } from '../lib/cookie';
import { AppError } from '../middleware/errorHandler';

export const authRouter = Router();

const registerLimiter = createRateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'rl:register' });
const loginLimiter = createRateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'rl:login' });
const refreshLimiter = createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'rl:refresh' });
const logoutLimiter = createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'rl:logout' });

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const r = await authService.register(req.body);
      setRefreshCookie(res, r.refreshToken);
      res.status(201).json({ user: r.user, accessToken: r.accessToken });
    } catch (e) {
      next(e);
    }
  },
);

authRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const r = await authService.login(req.body);
    setRefreshCookie(res, r.refreshToken);
    res.json({ user: r.user, accessToken: r.accessToken });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const cookie = req.cookies?.refreshToken;
    if (!cookie) throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
    const tokens = await authService.refresh(cookie);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', logoutLimiter, requireAuth, async (req, res, next) => {
  try {
    const token = req.headers.authorization!.slice(7).trim();
    await authService.logout(token);
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
