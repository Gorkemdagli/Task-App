import { Router } from 'express';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { validateBody } from '../middleware/validate';
import {
  registerLimiter,
  loginLimiter,
  refreshLimiter,
  writeLimiter,
} from '../middleware/rateLimitProfiles';
import * as authService from '../services/auth.service';
import { setRefreshCookie, clearRefreshCookie } from '../lib/cookie';
import { AppError } from '../lib/appError';

export const authRouter = Router();

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const r = await authService.register(req.body);
      setRefreshCookie(res, r.refreshToken, r.refreshExpiresAt * 1000 - Date.now());
      res.status(201).json({ user: r.user, accessToken: r.accessToken });
    } catch (e) {
      next(e);
    }
  },
);

authRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const r = await authService.login(req.body);
    setRefreshCookie(res, r.refreshToken, r.refreshExpiresAt * 1000 - Date.now());
    res.json({ user: r.user, accessToken: r.accessToken });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const cookie = req.cookies?.refreshToken;
    if (!cookie) {
      // Oturum yok → hata değil, normal durum. 204 dönünce browser
      // network paneli 4xx gibi kırmızı loglamaz.
      res.status(204).end();
      return;
    }
    const r = await authService.refresh(cookie);
    setRefreshCookie(res, r.refreshToken, r.refreshExpiresAt * 1000 - Date.now());
    res.json({ user: r.user, accessToken: r.accessToken });
  } catch (e) {
    if (e instanceof AppError && e.code === 'SESSION_EXPIRED') clearRefreshCookie(res);
    next(e);
  }
});

authRouter.post('/logout', writeLimiter, async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
    const refreshCookie = req.cookies?.refreshToken;

    if (!token && !refreshCookie) {
      res
        .status(401)
        .json({ error: 'UNAUTHORIZED', message: 'Geçersiz veya süresi dolmuş oturum' });
      return;
    }

    await authService.logout(token, refreshCookie);
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
