import { Router } from 'express';
import { env } from '../env';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../lib/appError';
import { issueRealtimeTicket, REALTIME_TICKET_TTL_SECONDS } from './tickets';

export function createRealtimeRouter(enabled = env.REALTIME_ENABLED): Router {
  const router = Router();

  router.post(
    '/ticket',
    (_req, res, next) => {
      if (!enabled) {
        res.status(404).json({ error: 'Not Found', message: 'Endpoint not found' });
        return;
      }
      next();
    },
    requireAuth,
    async (req, res) => {
      if (!req.user || !req.accessTokenJti) {
        throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
      }
      const ticket = await issueRealtimeTicket({
        jti: req.accessTokenJti,
        userId: req.user.id,
        tenantId: req.user.tenantId,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ticket, expiresIn: REALTIME_TICKET_TTL_SECONDS });
    },
  );

  router.use((_req, res) => {
    res.status(404).json({ error: 'Not Found', message: 'Endpoint not found' });
  });

  return router;
}
