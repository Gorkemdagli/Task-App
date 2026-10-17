import { Writable } from 'node:stream';
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { RequestTimingStage } from './requestTiming';
import { createRequestLogger } from '../middleware/requestLogger';

type LogEntry = {
  req?: { url: string; headers: { authorization?: string } };
  res?: { statusCode: number };
  request_timing_ms?: Partial<Record<RequestTimingStage, number>>;
};

function appWithLogs(timingEnabled: boolean) {
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
  app.use(...createRequestLogger(timingEnabled, logger));
  return { app, logs };
}

describe('request stage timing', () => {
  it('leaves requests uninstrumented when disabled', async () => {
    const { app, logs } = appWithLogs(false);
    let hasCollector: boolean | undefined;
    app.get('/api/v1/tasks', (req, res) => {
      hasCollector = req.requestTiming !== undefined;
      res.sendStatus(204);
    });

    await request(app).get('/api/v1/tasks');

    expect(hasCollector).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toHaveProperty('request_timing_ms');
  });

  it('records numeric stages only for the supported method and paths', async () => {
    const { app, logs } = appWithLogs(true);
    app.use((req, res) => {
      req.requestTiming?.record('handler_db_ms', 12.3);
      res.sendStatus(204);
    });

    await request(app).post('/api/v1/auth/login');
    await request(app).get('/api/v1/users/me');
    await request(app).get('/api/v1/teams');
    await request(app).get('/api/v1/tasks');
    await request(app).get('/api/v1/company/dashboard');
    await request(app).get('/api/v1/tasks/task-id');
    await request(app).post('/api/v1/tasks');

    expect(logs).toHaveLength(7);
    for (const log of logs.slice(0, 5)) {
      expect(log.request_timing_ms).toEqual({ handler_db_ms: 12.3 });
      expect(Object.values(log.request_timing_ms ?? {}).every(Number.isFinite)).toBe(true);
    }
    for (const log of logs.slice(5)) {
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
});
