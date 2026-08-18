import type { Application } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.get('/', (_req, res) => {
    res.json({ name: 'TaskFlow API', version: '0.1.0' });
  });

  app.use('/api/v1', apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found', message: 'Endpoint bulunamadı' });
  });

  app.use(errorHandler);

  return app;
}
