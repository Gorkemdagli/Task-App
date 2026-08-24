import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProductionSmoke } from './production-smoke.mjs';

describe('production smoke', () => {
  it('uses only read-only checks plus safe auth refresh and unsigned archive probes', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      assert.equal(options.headers?.Authorization, undefined);
      assert.equal(options.headers?.Cookie, undefined);
      const path = new URL(url).pathname;
      if (path === '/api/v1/health') {
        return new Response(JSON.stringify({ status: 'ok', release: 'sha-1' }), { status: 200 });
      }
      if (path === '/api/v1/ready') {
        return new Response(
          JSON.stringify({ status: 'ready', services: { database: 'up', redis: 'up' } }),
          { status: 200 },
        );
      }
      if (path === '/api/v1/auth/refresh') return new Response(null, { status: 204 });
      if (path === '/api/v1/internal/archive') return new Response(null, { status: 401 });
      if (path === '/api/v1/auth/not-allowed') return new Response(null, { status: 404 });
      if (path === '/api/v1/unknown') return new Response(null, { status: 404 });
      return new Response('<!doctype html>', { status: 200 });
    };

    await runProductionSmoke({
      vercelOrigin: 'https://app.example.test',
      renderOrigin: 'https://api.example.test',
      expectedRelease: 'sha-1',
      fetchImpl,
    });

    assert.deepEqual(calls.map(({ url, options }) => [new URL(url).origin, new URL(url).pathname, options.method ?? 'GET']), [
      ['https://app.example.test', '/', 'GET'],
      ['https://app.example.test', '/login', 'GET'],
      ['https://app.example.test', '/dashboard', 'GET'],
      ['https://app.example.test', '/api/v1/auth/refresh', 'POST'],
      ['https://app.example.test', '/api/v1/auth/not-allowed', 'GET'],
      ['https://api.example.test', '/', 'GET'],
      ['https://api.example.test', '/api/v1/health', 'GET'],
      ['https://api.example.test', '/api/v1/ready', 'GET'],
      ['https://api.example.test', '/api/v1/unknown', 'GET'],
      ['https://api.example.test', '/api/v1/internal/archive', 'POST'],
    ]);
  });

  it('fails when a mutating smoke scenario is requested', async () => {
    await assert.rejects(
      runProductionSmoke({
        vercelOrigin: 'https://app.example.test',
        renderOrigin: 'https://api.example.test',
        scenarios: [{ method: 'POST', path: '/tasks' }],
        fetchImpl: async () => new Response(null, { status: 200 }),
      }),
      /Mutating production smoke scenario is forbidden/,
    );
  });

  it('rejects non-HTTPS production origins', async () => {
    await assert.rejects(
      runProductionSmoke({
        vercelOrigin: 'http://app.example.test',
        renderOrigin: 'https://api.example.test',
        fetchImpl: async () => new Response(null, { status: 200 }),
      }),
      /must be an HTTPS origin/,
    );
  });
});
