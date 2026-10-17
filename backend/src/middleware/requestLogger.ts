import type { Request, RequestHandler } from 'express';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';
import { env } from '../env';
import { createRequestTimingMiddleware, type ProcessPoolSnapshot } from '../http/requestTiming';
import { logger } from '../lib/logger';
import { getRuntimePoolSnapshot } from '../lib/prisma';

export function createRequestLogger(
  timingEnabled: boolean,
  requestLoggerInstance: Logger = logger,
  getPoolSnapshot?: () => ProcessPoolSnapshot,
): RequestHandler[] {
  const snapshotPool = timingEnabled ? getPoolSnapshot : undefined;

  return [
    createRequestTimingMiddleware(timingEnabled, snapshotPool),
    pinoHttp({
      logger: requestLoggerInstance,
      customProps: (req, res) => {
        const timing = (req as Request).requestTiming;
        const stages = timing?.snapshot();
        const props: {
          request_timing_ms?: typeof stages;
          runtime_pool_process?: {
            scope: 'process';
            start: ProcessPoolSnapshot;
            end: ProcessPoolSnapshot;
          };
        } = {};

        if (stages && Object.keys(stages).length) props.request_timing_ms = stages;
        if (timing?.processPoolStart && snapshotPool && res.writableEnded) {
          try {
            props.runtime_pool_process = {
              scope: 'process',
              start: timing.processPoolStart,
              end: snapshotPool(),
            };
          } catch {
            // Pool telemetry must not alter request behavior.
          }
        }
        return props;
      },
    }),
  ];
}

export const requestLogger = createRequestLogger(
  env.REQUEST_STAGE_TIMING,
  logger,
  getRuntimePoolSnapshot,
);
