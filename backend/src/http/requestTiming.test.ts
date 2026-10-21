import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import express from 'express';
import { channel } from 'node:diagnostics_channel';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createRequestTimingMiddleware,
  type ProcessPoolSnapshot,
  type RequestTimingStage,
} from './requestTiming';
import { createRequestLogger } from '../middleware/requestLogger';

vi.mock('../lib/prisma', () => ({ getRuntimePoolSnapshot: vi.fn() }));

type LogEntry = {
  event?: string;
  route?: string;
  method?: string;
  requestId?: string;
  phase?: string;
  stage?: string;
  elapsedMs?: number;
  status?: number;
  req?: {
    url: string;
    headers: { authorization?: string; 'x-taskflow-request-id'?: string | string[] };
  };
  res?: { statusCode: number };
  request_timing_ms?: Partial<Record<RequestTimingStage, number>>;
  runtime_pool_process?: {
    scope: 'process';
    start: ProcessPoolSnapshot;
    end: ProcessPoolSnapshot;
  };
};

const stageTimingChannel = channel('taskflow.request-timing');

function appWithLogs(
  timingEnabled: boolean,
  getPoolSnapshot?: () => ProcessPoolSnapshot,
  beforeLogger?: express.RequestHandler,
) {
  const logs: LogEntry[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(JSON.parse(chunk.toString()) as LogEntry);
      callback();
    },
  });
  const logger = pino(
    {
      level: 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
    stream,
  );
  const app = express();
  if (beforeLogger) app.use(beforeLogger);
  app.use(...createRequestLogger(timingEnabled, logger, getPoolSnapshot));
  return { app, logs };
}

describe('request stage timing', () => {
  it('publishes only canonical numeric timing at response finish for subscribed consumers', async () => {
    const { app } = appWithLogs(true);
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    stageTimingChannel.subscribe(listener);
    try {
      app.get('/api/v1/teams/:teamId/dashboard', (req, res) => {
        req.requestTiming?.record('handler_db_ms', 12.3);
        res.status(200).json({ body: 'complete' });
      });
      const response = await request(app).get('/api/v1/teams/private-team-id/dashboard');
      expect(response.body).toEqual({ body: 'complete' });
      expect(events).toEqual([{
        method: 'GET',
        route: '/api/v1/teams/:teamId/dashboard',
        finished: true,
        stages: { handler_db_ms: 12.3 },
      }]);
      expect(JSON.stringify(events)).not.toMatch(/private-team-id|complete|header|cookie|user.?id/i);
    } finally {
      stageTimingChannel.unsubscribe(listener);
    }
  });

  it('publishes no timing event when request stage timing is disabled', async () => {
    const { app } = appWithLogs(false);
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    stageTimingChannel.subscribe(listener);
    try {
      app.get('/api/v1/tasks', (req, res) => {
        req.requestTiming?.record('handler_db_ms', 5);
        res.sendStatus(204);
      });
      await request(app).get('/api/v1/tasks');
      expect(events).toEqual([]);
    } finally {
      stageTimingChannel.unsubscribe(listener);
    }
  });

  it('leaves requests uninstrumented when disabled', async () => {
    const getPoolSnapshot = vi.fn();
    const { app, logs } = appWithLogs(false, getPoolSnapshot);
    let hasCollector: boolean | undefined;
    app.get('/api/v1/tasks', (req, res) => {
      hasCollector = req.requestTiming !== undefined;
      res.sendStatus(204);
    });

    await request(app).get('/api/v1/tasks');

    expect(hasCollector).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toHaveProperty('request_timing_ms');
    expect(logs[0]).not.toHaveProperty('runtime_pool_process');
    expect(getPoolSnapshot).not.toHaveBeenCalled();
  });

  it('logs start and completion pool snapshots separately for allowlisted requests', async () => {
    const start: ProcessPoolSnapshot = {
      totalCount: 1,
      idleCount: 0,
      waitingCount: 0,
      connectCount: 2,
      acquireCount: 3,
      removeCount: 1,
    };
    const end: ProcessPoolSnapshot = {
      totalCount: 2,
      idleCount: 1,
      waitingCount: 1,
      connectCount: 3,
      acquireCount: 4,
      removeCount: 1,
    };
    let current = start;
    const getPoolSnapshot = vi.fn(() => ({ ...current }));
    const { app, logs } = appWithLogs(true, getPoolSnapshot);
    app.get('/api/v1/tasks', (req, res) => {
      req.requestTiming?.record('handler_db_ms', 5);
      current = end;
      res.sendStatus(204);
    });
    app.get('/api/v1/tasks/task-id', (_req, res) => res.sendStatus(204));

    await request(app).get('/api/v1/tasks');
    await request(app).get('/api/v1/tasks/task-id');

    expect(getPoolSnapshot).toHaveBeenCalledTimes(2);
    expect(logs[0].request_timing_ms).toEqual({ handler_db_ms: 5 });
    expect(logs[0].runtime_pool_process).toEqual({ scope: 'process', start, end });
    expect(logs[1]).not.toHaveProperty('runtime_pool_process');
    expect(JSON.stringify(logs[0].runtime_pool_process)).not.toMatch(/password|secret|sql|user[_-]?id/i);
  });

  it('does not let pool snapshot errors interrupt a request', async () => {
    const start: ProcessPoolSnapshot = {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      connectCount: 0,
      acquireCount: 0,
      removeCount: 0,
    };
    let calls = 0;
    const getPoolSnapshot = vi.fn(() => {
      calls += 1;
      if (calls === 2) throw new Error('snapshot failed');
      return start;
    });
    const { app, logs } = appWithLogs(true, getPoolSnapshot);
    app.get('/api/v1/tasks', (_req, res) => res.sendStatus(204));

    const response = await request(app).get('/api/v1/tasks');

    expect(response.status).toBe(204);
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toHaveProperty('runtime_pool_process');
    expect(getPoolSnapshot).toHaveBeenCalledTimes(2);
  });

  it('records numeric stages only for the supported method and paths', async () => {
    const { app, logs } = appWithLogs(true);
    app.use((req, res) => {
      req.requestTiming?.record('handler_db_ms', 12.3);
      res.sendStatus(204);
    });

    await request(app).post('/api/v1/auth/login');
    await request(app).post('/api/v1/auth/refresh');
    await request(app).get('/api/v1/users/me');
    await request(app).get('/api/v1/teams');
    await request(app).get('/api/v1/tasks');
    await request(app).get('/api/v1/company/dashboard');
    await request(app).get('/api/v1/notifications?limit=10');
    await request(app).get('/api/v1/company/invitations?status=pending');
    await request(app).get('/api/v1/users/me/company-invitations?status=pending');
    await request(app).get('/api/v1/tasks/task-id');
    await request(app).post('/api/v1/tasks');
    await request(app).get('/api/v1/notifications/notification-id');
    await request(app).get('/api/v1/company/invitations/invitation-id');
    await request(app).post('/api/v1/notifications');
    await request(app).post('/api/v1/users/me/company-invitations/invitation-id/accept');

    const requestLogs = logs.filter((log) => log.event !== 'auth_refresh_request');
    expect(requestLogs).toHaveLength(15);
    for (const log of requestLogs.slice(0, 9)) {
      expect(log.request_timing_ms).toEqual({ handler_db_ms: 12.3 });
      expect(Object.values(log.request_timing_ms ?? {}).every(Number.isFinite)).toBe(true);
    }
    for (const log of requestLogs.slice(9)) {
      expect(log).not.toHaveProperty('request_timing_ms');
    }
  });

  it('times only exact team dashboard routes when enabled', async () => {
    const { app, logs } = appWithLogs(true);
    app.use((req, res) => {
      req.requestTiming?.record('handler_db_ms', 12.3);
      res.sendStatus(204);
    });

    await request(app).get('/api/v1/teams/team-id/dashboard');
    await request(app).get('/api/v1/teams/team-id/dashboard/extra');
    await request(app).get('/api/v1/teams/dashboard');
    await request(app).post('/api/v1/teams/team-id/dashboard');

    expect(logs[0].request_timing_ms).toEqual({ handler_db_ms: 12.3 });
    for (const log of logs.slice(1)) {
      expect(log).not.toHaveProperty('request_timing_ms');
    }
  });

  it('keeps concurrent request timings separate', async () => {
    const { app, logs } = appWithLogs(true);
    app.use(async (req, res, next) => {
      try {
        await req.requestTiming?.measure('handler_db_ms', () =>
          new Promise((resolve) => setTimeout(resolve, Number(req.query.wait))),
        );
        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    });

    await Promise.all([
      request(app).get('/api/v1/tasks?wait=120'),
      request(app).get('/api/v1/tasks?wait=5'),
    ]);

    const slow = logs.find((log) => log.req?.url.endsWith('wait=120'));
    const fast = logs.find((log) => log.req?.url.endsWith('wait=5'));
    expect(slow?.request_timing_ms?.handler_db_ms).toBeGreaterThan(100);
    expect(fast?.request_timing_ms?.handler_db_ms).toBeLessThan(100);
  });

  it('logs a failed stage on the error response without adding request data', async () => {
    const { app, logs } = appWithLogs(true);
    app.get('/api/v1/users/me', (req, res, next) => {
      void req.requestTiming
        ?.measure('handler_db_ms', async () => {
          throw new Error('timed failure');
        })
        .then(() => res.sendStatus(204), next);
    });
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.sendStatus(500);
    });

    await request(app).get('/api/v1/users/me');

    expect(logs).toHaveLength(1);
    expect(logs[0].res?.statusCode).toBe(500);
    expect(logs[0].request_timing_ms?.handler_db_ms).toEqual(expect.any(Number));
    expect(JSON.stringify(logs[0].request_timing_ms)).not.toContain('timed failure');
  });

  it('keeps secrets out of the serialized diagnostic field', async () => {
    const { app, logs } = appWithLogs(true);
    app.post('/api/v1/auth/login', (req, res) => {
      req.requestTiming?.record('password_verify_ms', 4);
      res.sendStatus(204);
    });

    await request(app)
      .post('/api/v1/auth/login')
      .set('Authorization', 'Bearer secret-token')
      .send({ email: 'private@example.com', password: 'secret-password' });

    expect(logs).toHaveLength(1);
    expect(logs[0].request_timing_ms).toEqual({ password_verify_ms: 4 });
    expect(JSON.stringify(logs[0].request_timing_ms)).not.toMatch(/secret|private|tenant|user/i);
    expect(JSON.stringify(logs[0])).not.toContain('secret-token');
    expect(logs[0].req?.headers.authorization).toBe('[redacted]');
  });

  it('logs safe lifecycle and allowlisted stage events for exact refresh requests', async () => {
    const { app, logs } = appWithLogs(true);
    const requestId = '6a2a2b9c-08a3-4d85-b647-5122d2e4d55f';
    app.post('/api/v1/auth/refresh', async (req, res) => {
      await req.requestTiming?.measure('session_redis_ms', () => Promise.resolve());
      await req.requestTiming?.measure('auth_db_ms', () => Promise.resolve());
      await req.requestTiming?.measure('handler_db_ms', () => Promise.resolve());
      res.sendStatus(204);
    });

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-taskflow-request-id', requestId)
      .set('Cookie', 'refreshToken=secret-cookie')
      .send({ refreshToken: 'secret-body' });

    const events = logs.filter((entry) => entry.event === 'auth_refresh_request');
    expect(events.map((event) => event.phase)).toEqual([
      'start',
      'stage_start',
      'stage_end',
      'stage_start',
      'stage_end',
      'finish',
    ]);
    expect(events.every((event) => event.route === '/api/v1/auth/refresh' && event.method === 'POST')).toBe(true);
    expect(events.every((event) => event.requestId === requestId)).toBe(true);
    expect(events.map((event) => event.stage).filter(Boolean)).toEqual([
      'session_redis_ms',
      'session_redis_ms',
      'auth_db_ms',
      'auth_db_ms',
    ]);
    expect(events.at(-1)).toMatchObject({ status: 204, elapsedMs: expect.any(Number) });
    expect(events.every((event) => !('req' in event))).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/secret-cookie|secret-body|refreshToken/i);
    expect(JSON.stringify(logs)).not.toContain('x-taskflow-request-id');
  });

  it('includes only a single canonical UUID correlation header in diagnostics', async () => {
    const requestId = '6a2a2b9c-08a3-4d85-b647-5122d2e4d55f';
    const arrayHeader = ((req, _res, next) => {
      if (req.query.multiple === 'true') {
        req.headers['x-taskflow-request-id'] = [requestId, requestId] as unknown as string;
      }
      next();
    }) as express.RequestHandler;
    const { app, logs } = appWithLogs(true, undefined, arrayHeader);
    app.post('/api/v1/auth/refresh', (_req, res) => res.sendStatus(204));

    await request(app).post('/api/v1/auth/refresh').set('x-taskflow-request-id', requestId);
    await request(app).post('/api/v1/auth/refresh').set('x-taskflow-request-id', 'attacker-value');
    await request(app)
      .post('/api/v1/auth/refresh?multiple=true')
      .set('x-taskflow-request-id', requestId);

    const events = logs.filter((entry) => entry.event === 'auth_refresh_request');
    expect(events.slice(0, 2).every((event) => event.requestId === requestId)).toBe(true);
    expect(events.slice(2).every((event) => !('requestId' in event))).toBe(true);
    expect(JSON.stringify(events)).not.toContain('attacker-value');
    expect(JSON.stringify(events)).not.toContain('multiple=true');
    expect(JSON.stringify(logs)).not.toContain('attacker-value');
  });

  it('keeps concurrent refresh diagnostics attached to their own correlation IDs', async () => {
    const { app, logs } = appWithLogs(true);
    const requestIds = [
      '6a2a2b9c-08a3-4d85-b647-5122d2e4d55f',
      '9a2a2b9c-08a3-4d85-b647-5122d2e4d55f',
    ];
    app.post('/api/v1/auth/refresh', async (req, res) => {
      await req.requestTiming?.measure(
        'session_redis_ms',
        () => new Promise((resolve) => setTimeout(resolve, Number(req.query.wait))),
      );
      res.sendStatus(204);
    });

    await Promise.all([
      request(app).post('/api/v1/auth/refresh?wait=20').set('x-taskflow-request-id', requestIds[0]!),
      request(app).post('/api/v1/auth/refresh?wait=1').set('x-taskflow-request-id', requestIds[1]!),
    ]);

    const events = logs.filter((entry) => entry.event === 'auth_refresh_request');
    for (const requestId of requestIds) {
      const requestEvents = events.filter((event) => event.requestId === requestId);
      expect(requestEvents.map((event) => event.phase)).toEqual([
        'start',
        'stage_start',
        'stage_end',
        'finish',
      ]);
      expect(requestEvents.every((event) => event.status === undefined || event.status === 204)).toBe(true);
    }
    expect(events).toHaveLength(8);
    expect(JSON.stringify(events)).not.toContain('wait=');
  });

  it('emits no refresh diagnostics when disabled or for another route', async () => {
    const disabled = appWithLogs(false);
    disabled.app.post('/api/v1/auth/refresh', (_req, res) => res.sendStatus(204));
    await request(disabled.app).post('/api/v1/auth/refresh');
    expect(disabled.logs.some((entry) => entry.event === 'auth_refresh_request')).toBe(false);

    const enabled = appWithLogs(true);
    enabled.app.get('/api/v1/tasks', (_req, res) => res.sendStatus(204));
    await request(enabled.app).get('/api/v1/tasks');
    expect(enabled.logs.some((entry) => entry.event === 'auth_refresh_request')).toBe(false);
  });

  it('logs one terminal event when finish and close both fire', () => {
    const events: unknown[] = [];
    const requestId = '6a2a2b9c-08a3-4d85-b647-5122d2e4d55f';
    const req = {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      headers: { 'x-taskflow-request-id': requestId },
    } as express.Request;
    const res = new EventEmitter() as express.Response;
    Object.assign(res, { statusCode: 204 });

    createRequestTimingMiddleware(true, undefined, (event) => events.push(event))(req, res, () => {});
    res.emit('finish');
    res.emit('close');

    expect(events).toHaveLength(2);
    expect(events.map((event) => (event as LogEntry).phase)).toEqual(['start', 'finish']);
  });

  it('isolates diagnostic logger failures from request timing and response behavior', async () => {
    const app = express();
    app.use(createRequestTimingMiddleware(true, undefined, () => {
      throw new Error('diagnostic logger secret');
    }));
    let stages: Partial<Record<RequestTimingStage, number>> | undefined;
    app.post('/api/v1/auth/refresh', async (req, res) => {
      await req.requestTiming?.measure('session_redis_ms', () => Promise.resolve());
      stages = req.requestTiming?.snapshot();
      res.sendStatus(204);
    });

    const response = await request(app).post('/api/v1/auth/refresh');

    expect(response.status).toBe(204);
    expect(stages?.session_redis_ms).toEqual(expect.any(Number));
  });
});
