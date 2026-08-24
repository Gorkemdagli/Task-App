import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertLocalLighthouseTarget } = require('./lighthouse-auth.cjs');

test('Lighthouse credential target is local-only', () => {
  assert.equal(
    assertLocalLighthouseTarget('http://127.0.0.1:4173/dashboard').origin,
    'http://127.0.0.1:4173',
  );
  assert.throws(
    () => assertLocalLighthouseTarget('https://attacker.example/dashboard'),
    /local-only/,
  );
  assert.throws(
    () => assertLocalLighthouseTarget('https://127.0.0.1:4173/dashboard'),
    /local-only/,
  );
});
