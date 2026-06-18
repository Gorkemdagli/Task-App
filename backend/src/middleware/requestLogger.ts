import { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export const requestLogger: RequestHandler[] = [
  pinoHttp({ logger }),
];