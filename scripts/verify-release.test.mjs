import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRelease } from './verify-release.mjs';

describe('release verification', () => {
  it('polls health until target release then requires ready dependencies', async () => {
    let healthCalls = 0;
    const fetchImpl = async (url) => {
      if (url.endsWith('/health')) {
        healthCalls += 1;
        return new Response(JSON.stringify({ status: 'ok', release: healthCalls === 1 ? 'old' : 'sha-1' }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ status: 'ready', services: { database: 'up', redis: 'up' } }), {
        status: 200,
      });
    };

    await assert.doesNotReject(
      verifyRelease({
        healthUrl: 'https://api.example.test/api/v1/health',
        readyUrl: 'https://api.example.test/api/v1/ready',
        targetRelease: 'sha-1',
        fetchImpl,
        pollIntervalMs: 0,
        timeoutMs: 1000,
      }),
    );
    assert.equal(healthCalls, 2);
  });

  it('fails on malformed health response and timeout', async () => {
    await assert.rejects(
      verifyRelease({
        healthUrl: 'https://api.example.test/api/v1/health',
        readyUrl: 'https://api.example.test/api/v1/ready',
        targetRelease: 'sha-1',
        fetchImpl: async () => new Response('{bad', { status: 200 }),
        pollIntervalMs: 0,
        timeoutMs: 20,
      }),
      /Malformed health response/,
    );

    await assert.rejects(
      verifyRelease({
        healthUrl: 'https://api.example.test/api/v1/health',
        readyUrl: 'https://api.example.test/api/v1/ready',
        targetRelease: 'sha-1',
        fetchImpl: async () => new Response(JSON.stringify({ status: 'ok', release: 'old' }), { status: 200 }),
        pollIntervalMs: 0,
        timeoutMs: 20,
      }),
      /Timed out waiting for release sha-1/,
    );
  });

  it('rejects non-HTTPS release endpoints', async () => {
    await assert.rejects(
      verifyRelease({
        healthUrl: 'http://api.example.test/api/v1/health',
        readyUrl: 'https://api.example.test/api/v1/ready',
        targetRelease: 'sha-1',
        fetchImpl: async () => new Response(null, { status: 200 }),
      }),
      /must use HTTPS/,
    );
  });
});
