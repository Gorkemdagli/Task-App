import type { Request, RequestHandler } from 'express';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';
import { env } from '../env';
import { createRequestTimingMiddleware } from '../http/requestTiming';
import { logger } from '../lib/logger';

export function createRequestLogger(
  timingEnabled: boolean,
  requestLoggerInstance: Logger = logger,
): RequestHandler[] {
  return [
    createRequestTimingMiddleware(timingEnabled),
    pinoHttp({
      logger: requestLoggerInstance,
      customProps: (req) => {
        const timing = (req as Request).requestTiming;
        const stages = timing?.snapshot();
        return stages && Object.keys(stages).length ? { request_timing_ms: stages } : {};
      },
    }),
  ];
}

export const requestLogger = createRequestLogger(env.REQUEST_STAGE_TIMING);
