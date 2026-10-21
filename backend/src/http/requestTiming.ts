import type { Request, RequestHandler } from 'express';
import { performance } from 'node:perf_hooks';
import { channel } from 'node:diagnostics_channel';
import type { TransactionPhase, TransactionPhaseRecorder } from '../db/withTenant';

// Spans aggregate attempts and nest in broad totals; open includes setup/BEGIN,
// finish includes commit/rollback rather than isolating pool wait or commit time.
export type RequestTimingStage =
  | 'rate_limit_ms'
  | 'session_redis_ms'
  | 'auth_db_ms'
  | 'handler_db_ms'
  | 'password_verify_ms'
  // Dashboard elapsed stages include Prisma/driver overhead, not PostgreSQL-only execution time.
  | 'company_dashboard_summary_query_elapsed_ms'
  | 'company_dashboard_members_query_elapsed_ms'
  | 'company_dashboard_risk_tasks_query_elapsed_ms'
  | 'company_dashboard_trend_query_elapsed_ms'
  | 'company_dashboard_teams_query_elapsed_ms'
  | 'company_dashboard_cumulative_flow_query_elapsed_ms'
  | 'company_dashboard_cumulative_flow_compute_elapsed_ms'
  // Prisma/driver elapsed time; findMany includes relation loading. Both run concurrently, so do not sum them.
  | 'task_list_find_many_elapsed_ms'
  | 'task_list_count_elapsed_ms'
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
  observeDiagnosticStage?: (
    phase: 'start' | 'end',
    stage: RequestTimingStage,
    elapsedMs?: number,
  ) => void;
};

type RefreshDiagnostic = {
  event: 'auth_refresh_request';
  route: '/api/v1/auth/refresh';
  method: 'POST';
  requestId?: string;
  phase: 'start' | 'stage_start' | 'stage_end' | 'finish' | 'close';
  stage?: 'rate_limit_ms' | 'session_redis_ms' | 'auth_db_ms';
  elapsedMs?: number;
  status?: number;
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
  'POST /api/v1/auth/refresh',
  'GET /api/v1/users/me',
  'GET /api/v1/teams',
  'GET /api/v1/tasks',
  'GET /api/v1/company/dashboard',
  'GET /api/v1/notifications',
  'GET /api/v1/company/invitations',
  'GET /api/v1/users/me/company-invitations',
]);
const requestTimingChannel = channel('taskflow.request-timing');

function canonicalTimedRoute(method: string, path: string): string | undefined {
  if (timedRoutes.has(`${method} ${path}`)) return path;
  if (method === 'GET' && /^\/api\/v1\/teams\/[^/]+\/dashboard$/.test(path)) {
    return '/api/v1/teams/:teamId/dashboard';
  }
  return undefined;
}

export function createRequestTiming(): RequestTimingRecorder {
  const durations: Partial<Record<RequestTimingStage, number>> = {};

  return {
    async measure<T>(stage: RequestTimingStage, work: () => T | Promise<T>): Promise<T> {
      const started = performance.now();
      try {
        this.observeDiagnosticStage?.('start', stage);
      } catch {
        // Diagnostic observers must not change request behavior.
      }
      try {
        return await work();
      } finally {
        const elapsedMs = performance.now() - started;
        this.record(stage, elapsedMs);
        try {
          this.observeDiagnosticStage?.('end', stage, elapsedMs);
        } catch {
          // Diagnostic observers must not change request behavior.
        }
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
  logDiagnostic?: (event: RefreshDiagnostic) => void,
): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();

  return (req: Request, res, next) => {
    const route = canonicalTimedRoute(req.method, req.path);
    if (route) {
      const timing = createRequestTiming();
      try {
        timing.processPoolStart = getPoolSnapshot?.();
      } catch {
        // Pool telemetry must not alter request behavior.
      }
      req.requestTiming = timing;
      if (route === '/api/v1/auth/refresh' && req.method === 'POST' && logDiagnostic) {
        const incomingRequestId = req.headers['x-taskflow-request-id'];
        const requestId =
          typeof incomingRequestId === 'string' &&
          /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(incomingRequestId)
            ? incomingRequestId
            : undefined;
        delete req.headers['x-taskflow-request-id'];
        const log = (event: Omit<RefreshDiagnostic, 'event' | 'route' | 'method' | 'requestId'>) => {
          try {
            logDiagnostic({
              event: 'auth_refresh_request',
              route: '/api/v1/auth/refresh',
              method: 'POST',
              ...(requestId ? { requestId } : {}),
              ...event,
            });
          } catch {
            // Diagnostic logging must not change request behavior.
          }
        };
        timing.observeDiagnosticStage = (phase, stage, elapsedMs) => {
          if (
            stage !== 'rate_limit_ms' &&
            stage !== 'session_redis_ms' &&
            stage !== 'auth_db_ms'
          ) {
            return;
          }
          log({
            phase: phase === 'start' ? 'stage_start' : 'stage_end',
            stage,
            ...(elapsedMs === undefined
              ? {}
              : { elapsedMs: Math.max(0, Math.round(elapsedMs * 10) / 10) }),
          });
        };
        // The logger is mounted after parsers; this records logger-entry time, not upstream arrival.
        const started = performance.now();
        let terminal = false;
        const finish = (phase: 'finish' | 'close') => {
          if (terminal) return;
          terminal = true;
          res.off('finish', onFinish);
          res.off('close', onClose);
          log({
            phase,
            elapsedMs: Math.max(0, Math.round((performance.now() - started) * 10) / 10),
            status: res.statusCode,
          });
        };
        const onFinish = () => finish('finish');
        const onClose = () => finish('close');
        log({ phase: 'start' });
        res.once('finish', onFinish);
        res.once('close', onClose);
      }
      if (requestTimingChannel.hasSubscribers) {
        res.once('finish', () => {
          requestTimingChannel.publish({
            method: req.method,
            route,
            finished: true,
            stages: timing.snapshot(),
          });
        });
      }
    }
    next();
  };
}
