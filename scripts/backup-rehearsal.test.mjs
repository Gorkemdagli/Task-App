import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('./backup-rehearsal.sh', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('./Dockerfile.backup-rehearsal', import.meta.url), 'utf8');

describe('disposable backup rehearsal', () => {
  it('uses an ephemeral Postgres container and the production backup/verify scripts', () => {
    assert.match(script, /postgres@sha256:[a-f0-9]{64}/);
    assert.match(script, /docker run/);
    assert.match(script, /encrypted-pg-backup\.sh/);
    assert.match(script, /verify-backup\.sh/);
    assert.match(script, /gpg/);
  });

  it('does not accept a caller-supplied production database URL', () => {
    assert.match(script, /DATABASE_URL=postgresql:\/\/postgres:taskflow@db:5432\/taskflow_rehearsal/);
    assert.doesNotMatch(script, /PRODUCTION_DATABASE_URL/);
  });

  it('mounts only scripts and uses pinned prebuilt images without runtime package installation', () => {
    assert.match(script, /postgres@sha256:[a-f0-9]{64}/);
    assert.match(script, /Dockerfile\.backup-rehearsal/);
    assert.match(script, /\/workspace\/scripts:ro/);
    assert.doesNotMatch(script, /docker_workspace_dir/);
    assert.doesNotMatch(script, /apt-get/);
    assert.match(dockerfile, /FROM debian@sha256:[a-f0-9]{64}/);
    assert.match(dockerfile, /apt-get install/);
  });
});
