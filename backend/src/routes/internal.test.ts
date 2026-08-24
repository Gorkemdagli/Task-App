import express, { type Request, type RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createInternalRouter } from './internal';
import { createApp } from '../app';

describe('POST /api/v1/internal/archive', () => {
  it('mounts without user auth and rejects unsigned delivery', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/archive')
      .set('content-type', 'application/json')
      .send('{"delivery":"unsigned"}');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid QStash signature' });
  });

  it('runs signature validation before Redis rate limit and archive batch', async () => {
    const order: string[] = [];
    const runArchiveBatch = vi.fn().mockResolvedValue({ archivedCount: 2 });
    const signatureMiddleware: RequestHandler = (req, _res, next) => {
      order.push('signature');
      expect(req.rawBody?.toString('utf8')).toBe('{"delivery":"qstash"}');
      next();
    };
    const rateLimitMiddleware: RequestHandler = (_req, _res, next) => {
      order.push('rate-limit');
      next();
    };
    const app = express();
    app.use(
      '/api/v1/internal/archive',
      express.raw({
        type: '*/*',
        limit: '64kb',
        verify: (req, _res, body) => {
          (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
        },
      }),
    );
    app.use(
      '/api/v1/internal',
      createInternalRouter({ signatureMiddleware, rateLimitMiddleware, runArchiveBatch }),
    );

    const response = await request(app)
      .post('/api/v1/internal/archive')
      .set('content-type', 'application/json')
      .send('{"delivery":"qstash"}');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ archivedCount: 2 });
    expect(order).toEqual(['signature', 'rate-limit']);
    expect(runArchiveBatch).toHaveBeenCalledOnce();
  });

  it('does not call rate limit or archive batch when signature rejects', async () => {
    const runArchiveBatch = vi.fn();
    const rateLimitMiddleware = vi.fn<RequestHandler>((_req, _res, next) => next());
    const signatureMiddleware: RequestHandler = (_req, res) => {
      res.status(401).json({ error: 'Invalid QStash signature' });
    };
    const app = express();
    app.use(
      '/api/v1/internal/archive',
      express.raw({
        type: '*/*',
        limit: '64kb',
        verify: (req, _res, body) => {
          (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
        },
      }),
    );
    app.use(
      '/api/v1/internal',
      createInternalRouter({ signatureMiddleware, rateLimitMiddleware, runArchiveBatch }),
    );

    const response = await request(app)
      .post('/api/v1/internal/archive')
      .set('content-type', 'application/json')
      .send('{"delivery":"unsigned"}');

    expect(response.status).toBe(401);
    expect(rateLimitMiddleware).not.toHaveBeenCalled();
    expect(runArchiveBatch).not.toHaveBeenCalled();
  });
});
