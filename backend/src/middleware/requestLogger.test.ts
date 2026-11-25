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
    app.get('/api/v1/cookie-redaction', (_req, res) =>
      res.cookie('session', 'outgoing-set-cookie-redaction-marker').sendStatus(200),
    );

    await request(app)
      .get('/api/v1/storage/private?token=private-token&download=report.pdf')
      .set('Authorization', 'Bearer access-token');
    await request(app).get('/api/v1/health?probe=ready');
    await request(app)
      .get('/api/v1/health')
      .set('Sec-WebSocket-Protocol', 'taskflow.v1, ticket.logger-redaction-marker');
    await request(app).get('/api/v1/health?ticket=query-ticket-redaction-marker');
    await request(app).get('/api/v1/health?token=query-token-redaction-marker');
    await request(app)
      .get('/api/v1/cookie-redaction')
      .set('Cookie', 'session=incoming-cookie-redaction-marker');
    const logs = lines.join('');

    expect(logs).not.toContain('private-token');
    expect(logs).not.toContain('download=report.pdf');
    expect(logs).not.toContain('Bearer access-token');
    expect(logs).not.toContain('ticket.logger-redaction-marker');
    expect(logs).not.toContain('query-ticket-redaction-marker');
    expect(logs).not.toContain('query-token-redaction-marker');
    expect(logs).not.toContain('incoming-cookie-redaction-marker');
    expect(logs).not.toContain('outgoing-set-cookie-redaction-marker');
    expect(logs).toContain('/api/v1/storage/private');
    expect(logs).toContain('/api/v1/health?probe=ready');
  });
});
