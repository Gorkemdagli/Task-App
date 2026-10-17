import type { Request, RequestHandler } from 'express';
import { performance } from 'node:perf_hooks';

export type RequestTimingStage =
  | 'rate_limit_ms'
  | 'session_redis_ms'
  | 'auth_db_ms'
  | 'handler_db_ms'
  | 'password_verify_ms';

export type RequestTimingRecorder = {
  measure<T>(stage: RequestTimingStage, work: () => T | Promise<T>): Promise<T>;
  record(stage: RequestTimingStage, elapsedMs: number): void;
  snapshot(): Partial<Record<RequestTimingStage, number>>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestTiming?: RequestTimingRecorder;
    }
  }
}

const timedRoutes = new Set([
  'POST /api/v1/auth/login',
  'GET /api/v1/users/me',
  'GET /api/v1/teams',
  'GET /api/v1/tasks',
  'GET /api/v1/company/dashboard',
]);

export function createRequestTiming(): RequestTimingRecorder {
  const durations: Partial<Record<RequestTimingStage, number>> = {};

  return {
    async measure<T>(stage: RequestTimingStage, work: () => T | Promise<T>): Promise<T> {
      const started = performance.now();
      try {
        return await work();
      } finally {
        this.record(stage, performance.now() - started);
      }
    },
    record(stage, elapsedMs) {
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
        durations[stage] = (durations[stage] ?? 0) + elapsedMs;
      }
    },
    snapshot() {
      const result: Partial<Record<RequestTimingStage, number>> = {};
      for (const [stage, duration] of Object.entries(durations)) {
        result[stage as RequestTimingStage] = Math.round(duration * 10) / 10;
      }
      return result;
    },
  };
}

export function measureRequestStage<T>(
  timing: RequestTimingRecorder | undefined,
  stage: RequestTimingStage,
  work: () => T | Promise<T>,
): Promise<T> | T {
  return timing ? timing.measure(stage, work) : work();
}

export function createRequestTimingMiddleware(enabled: boolean): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();

  return (req: Request, _res, next) => {
    if (timedRoutes.has(`${req.method} ${req.path}`)) {
      req.requestTiming = createRequestTiming();
    }
    next();
  };
}
