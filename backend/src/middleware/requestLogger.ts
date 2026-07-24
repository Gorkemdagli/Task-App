import type { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger: RequestHandler[] = [pinoHttp({ logger })];
