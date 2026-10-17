import type { Request, RequestHandler } from 'express';
import { performance } from 'node:perf_hooks';
import type { TransactionPhase, TransactionPhaseRecorder } from '../db/withTenant';

// Spans aggregate attempts and nest in broad totals; open includes setup/BEGIN,
// finish includes commit/rollback rather than isolating pool wait or commit time.
export type RequestTimingStage =
  | 'rate_limit_ms'
  | 'session_redis_ms'
  | 'auth_db_ms'
  | 'handler_db_ms'
  | 'password_verify_ms'
  | `auth_${TransactionPhase}`
  | `handler_${TransactionPhase}`;

export type ProcessPoolSnapshot = {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  connectCount: number;
  acquireCount: number;
  removeCount: number;
};

export type RequestTimingRecorder = {
  measure<T>(stage: RequestTimingStage, work: () => T | Promise<T>): Promise<T>;
  record(stage: RequestTimingStage, elapsedMs: number): void;
  snapshot(): Partial<Record<RequestTimingStage, number>>;
  processPoolStart?: ProcessPoolSnapshot;
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
  'GET /api/v1/notifications',
  'GET /api/v1/company/invitations',
  'GET /api/v1/users/me/company-invitations',
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

export function createTransactionPhaseRecorder(
  timing: RequestTimingRecorder | undefined,
  prefix: 'auth' | 'handler',
): TransactionPhaseRecorder | undefined {
  return timing ? (phase, elapsedMs) => timing.record(`${prefix}_${phase}`, elapsedMs) : undefined;
}

export function createRequestTimingMiddleware(
  enabled: boolean,
  getPoolSnapshot?: () => ProcessPoolSnapshot,
): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();

  return (req: Request, _res, next) => {
    if (timedRoutes.has(`${req.method} ${req.path}`)) {
      const timing = createRequestTiming();
      try {
        timing.processPoolStart = getPoolSnapshot?.();
      } catch {
        // Pool telemetry must not alter request behavior.
      }
      req.requestTiming = timing;
    }
    next();
  };
}
