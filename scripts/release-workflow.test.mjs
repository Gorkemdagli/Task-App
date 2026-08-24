import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

describe('production release workflow', () => {
  it('keeps release ordered, protected, and exact-SHA gated', () => {
    assert.match(workflow, /concurrency:/);
    assert.match(workflow, /cancel-in-progress:\s*false/);
    assert.match(workflow, /TARGET_SHA/);
    assert.match(workflow, /migrate-production/);
    assert.match(workflow, /backup/);
    assert.match(workflow, /render/i);
    assert.match(workflow, /production-smoke\.mjs/);
    assert.match(workflow, /environment:\s*production/);
  });

  it('does not run mutating Playwright smoke against production or print secret values', () => {
    assert.doesNotMatch(workflow, /playwright test/i);
    assert.doesNotMatch(workflow, /echo\s+.*(DATABASE_URL|SENTRY_AUTH_TOKEN|DEPLOY_HOOK)/i);
    assert.match(workflow, /upload-artifact/);
    assert.match(workflow, /\.dump\.gpg/);
  });
});
