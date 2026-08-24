import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalOrigin, getLighthousePaths } from './run-lighthouse-gate.mjs';

describe('local Lighthouse gate', () => {
  it('accepts localhost origins only', () => {
    assert.equal(assertLocalOrigin('http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
    assert.throws(() => assertLocalOrigin('https://production.example.com'), /local-only/i);
  });

  it('limits public-only mode to non-authenticated pages', () => {
    assert.deepEqual(getLighthousePaths(true), ['/', '/login']);
  });
});
