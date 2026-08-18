import test from 'node:test';
import assert from 'node:assert/strict';
import { collectInitialFiles, evaluateBundleBudget } from './check-bundle-budget.mjs';

const manifest = {
  entry: { file: 'assets/entry.js', isEntry: true, imports: ['shared'] },
  shared: { file: 'assets/shared.js', imports: ['deep'] },
  deep: { file: 'assets/deep.js' },
  async: { file: 'assets/async.js' },
};

function noisy(size) {
  const buffer = Buffer.alloc(size);
  let value = 0x12345678;
  for (let index = 0; index < buffer.length; index += 1) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    buffer[index] = value & 0xff;
  }
  return buffer;
}

test('collects recursive static imports and excludes async outputs', () => {
  assert.deepEqual([...collectInitialFiles(manifest)].sort(), [
    'assets/deep.js',
    'assets/entry.js',
    'assets/shared.js',
  ]);
});

test('fails initial gzip budget', () => {
  const result = evaluateBundleBudget({
    manifest,
    readFile: () => noisy(300_000),
  });
  assert.equal(result.failures.some((failure) => failure.includes('initial')), true);
});

test('fails async gzip budget', () => {
  const result = evaluateBundleBudget({
    manifest,
    readFile: (file) => file.includes('async') ? noisy(200_000) : Buffer.from('ok'),
  });
  assert.equal(result.failures.some((failure) => failure.includes('async')), true);
});
