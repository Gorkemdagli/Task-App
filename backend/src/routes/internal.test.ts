import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

describe('retired archive HTTP trigger', () => {
  it('does not allow anonymous requests on the former path to trigger archival', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/archive')
      .set('content-type', 'application/json')
      .send('{"delivery":"unsigned"}');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });
});
