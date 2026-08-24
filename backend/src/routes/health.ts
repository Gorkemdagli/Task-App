import { Router } from 'express';
import { env } from '../env';

export const healthRouter = Router();

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  release: string;
}

healthRouter.get('/', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    release: process.env.RENDER_GIT_COMMIT ?? env.SENTRY_RELEASE ?? 'unknown',
  };

  res.status(200).json(response);
});
