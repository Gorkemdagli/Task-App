import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRequestLogger } from './requestLogger';

describe('request logger', () => {
  it('redacts signed storage query strings while retaining ordinary request URLs', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });
    const app = express();
    app.use(...createRequestLogger(false, logger));
    app.get('/api/v1/storage/private', (_req, res) => res.sendStatus(200));
    app.get('/api/v1/health', (_req, res) => res.sendStatus(200));

    await request(app)
      .get('/api/v1/storage/private?token=private-token&download=report.pdf')
      .set('Authorization', 'Bearer access-token');
    await request(app).get('/api/v1/health?probe=ready');
    const logs = lines.join('');

    expect(logs).not.toContain('private-token');
    expect(logs).not.toContain('download=report.pdf');
    expect(logs).not.toContain('Bearer access-token');
    expect(logs).toContain('/api/v1/storage/private');
    expect(logs).toContain('/api/v1/health?probe=ready');
  });
});
