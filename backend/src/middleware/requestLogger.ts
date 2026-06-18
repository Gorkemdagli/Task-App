import type { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { env } from '../env';

const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export const requestLogger: RequestHandler[] = [pinoHttp({ logger })];
