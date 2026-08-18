import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler';
import { uploadAvatar } from './imageUpload';
import { AVATAR_MAX_INPUT_BYTES } from '../lib/media';

function createUploadApp() {
  const app = express();
  app.post('/upload', uploadAvatar, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('imageUpload', () => {
  it('rejects files over 25 MB with 413', async () => {
    const response = await request(createUploadApp())
      .post('/upload')
      .attach('avatar', Buffer.alloc(AVATAR_MAX_INPUT_BYTES + 1), 'avatar.png');

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('FILE_TOO_LARGE');
  });
});
