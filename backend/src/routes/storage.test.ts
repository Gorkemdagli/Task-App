import { createHmac } from 'node:crypto';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../env';
import { createLocalObjectStorage } from '../lib/localStorage';
import { storageRouter } from './storage';

const signingSecret = 'random-local-signing-secret-with-32-bytes';
const objectPath = 'tenants/tenant-a/tasks/task-a/files/file-a';
let now: number;
let root: string;
let app: express.Express;

function token(claims: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    path: objectPath,
    mimeType: 'application/pdf',
    originalName: 'trusted report.pdf',
    expiresAt: now + 60_000,
    ...overrides,
  };
}

function signedUrl(value = token(validClaims())) {
  return `/api/v1/storage/private?token=${encodeURIComponent(value)}`;
}

describe('local storage routes', () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'taskflow-storage-route-'));
    env.STORAGE_PROVIDER = 'local';
    env.LOCAL_STORAGE_ROOT = root;
    env.LOCAL_STORAGE_SIGNING_SECRET = signingSecret;
    env.PUBLIC_API_ORIGIN = 'http://api.test';
    now = Date.now();
    app = express();
    app.use('/api/v1/storage', storageRouter);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('serves only canonical public media keys and keeps private keys off public routes', async () => {
    const storage = createLocalObjectStorage(root);
    await storage.upload('public', 'avatars/user-a/avatar.webp', Buffer.from('webp'));
    await storage.upload('private', objectPath, Buffer.from('private'));

    const media = await request(app).get('/api/v1/storage/media/avatars/user-a/avatar.webp');
    expect(media.status).toBe(200);
    expect(media.headers['content-type']).toMatch(/image\/webp/);
    expect(media.body).toEqual(Buffer.from('webp'));

    const privateFile = await request(app).get(`/api/v1/storage/media/${objectPath}`);
    expect(privateFile.status).toBe(404);
  });

  it('serves a signed file with trusted MIME and filename, ignoring the download query', async () => {
    await createLocalObjectStorage(root).upload('private', objectPath, Buffer.from('%PDF-1.7'));

    const response = await request(app).get(`${signedUrl()}&download=untrusted.html`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain('trusted report.pdf');
    expect(response.headers['content-disposition']).not.toContain('untrusted.html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toEqual(Buffer.from('%PDF-1.7'));
  });

  it('supports HEAD and a single byte range, and rejects unsatisfiable ranges', async () => {
    await createLocalObjectStorage(root).upload('private', objectPath, Buffer.from('0123456789'));

    const head = await request(app).head(signedUrl());
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe('10');
    expect(head.text).toBeUndefined();

    const range = await request(app).get(signedUrl()).set('Range', 'bytes=2-5');
    expect(range.status).toBe(206);
    expect(range.headers['content-range']).toBe('bytes 2-5/10');
    expect(range.body).toEqual(Buffer.from('2345'));

    const invalid = await request(app).get(signedUrl()).set('Range', 'bytes=10-12');
    expect(invalid.status).toBe(416);
    expect(invalid.headers['content-range']).toBe('bytes */10');
  });

  it.each([
    ['tampered signature', () => `${token(validClaims()).slice(0, -1)}x`],
    ['expired token', () => token(validClaims({ expiresAt: now }))],
    ['future token beyond the 60-second window', () => token(validClaims({ expiresAt: now + 60_001 }))],
    ['private path traversal', () => token(validClaims({ path: 'tenants/tenant-a/tasks/task-a/files/../../outside' }))],
    ['invalid MIME', () => token(validClaims({ mimeType: 'text/html\r\nX-Evil: yes' }))],
  ])('denies %s', async (_label, makeToken) => {
    const response = await request(app).get(signedUrl(makeToken()));
    expect(response.status).toBe(404);
  });

  it('sanitizes control characters in the signed filename before writing headers', async () => {
    await createLocalObjectStorage(root).upload('private', objectPath, Buffer.from('file'));
    const maliciousName = 'report.pdf\r\nX-Evil: yes';

    const response = await request(app).get(signedUrl(token(validClaims({ originalName: maliciousName }))));

    expect(response.status).toBe(200);
    expect(response.headers['x-evil']).toBeUndefined();
    expect(response.headers['content-disposition']).not.toContain('\r');
    expect(response.headers['content-disposition']).toContain('report.pdf__X-Evil: yes');
  });

  it('denies a valid signed link when the private object is missing', async () => {
    const response = await request(app).get(signedUrl());
    expect(response.status).toBe(404);
  });

  it('closes a private file stream after the client aborts', async () => {
    await createLocalObjectStorage(root).upload('private', objectPath, Buffer.alloc(2 * 1024 * 1024, 0x61));
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await new Promise<void>((resolve, reject) => {
        let gotResponse = false;
        const incoming = get(`http://127.0.0.1:${port}${signedUrl()}`, (response) => {
          gotResponse = true;
          expect(response.statusCode).toBe(200);
          response.once('data', () => response.destroy());
          response.once('close', resolve);
        });
        incoming.on('error', (error) => {
          if (gotResponse) resolve();
          else reject(error);
        });
      });
      const retry = await request(app).get(signedUrl());
      expect(retry.status).toBe(200);
      expect(retry.body.length).toBe(2 * 1024 * 1024);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
