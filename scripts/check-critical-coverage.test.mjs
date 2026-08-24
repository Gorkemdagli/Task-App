import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertCriticalCoverage } from './check-critical-coverage.mjs';

function fileCoverage(overrides = {}) {
  return {
    path: '/workspace/backend/src/middleware/auth.ts',
    statementMap: { 0: {}, 1: {} },
    fnMap: { 0: {}, 1: {} },
    branchMap: { 0: { locations: [{}, {}] } },
    s: { 0: 1, 1: 1 },
    f: { 0: 1, 1: 1 },
    b: { 0: [1, 1] },
    ...overrides,
  };
}

describe('critical coverage gate', () => {
  it('accepts every required metric at 100 percent', () => {
    assert.doesNotThrow(() =>
      assertCriticalCoverage(
        { '/workspace/backend/src/middleware/auth.ts': fileCoverage() },
        ['backend/src/middleware/auth.ts'],
        100,
      ),
    );
  });

  it('rejects a critical file with an uncovered branch', () => {
    assert.throws(
      () =>
        assertCriticalCoverage(
          {
            '/workspace/backend/src/middleware/auth.ts': fileCoverage({ b: { 0: [1, 0] } }),
          },
          ['backend/src/middleware/auth.ts'],
          100,
        ),
      /branch coverage.*100%/i,
    );
  });

  it('rejects a missing critical file', () => {
    assert.throws(
      () => assertCriticalCoverage({}, ['backend/src/middleware/auth.ts']),
      /missing critical coverage/i,
    );
  });
});
