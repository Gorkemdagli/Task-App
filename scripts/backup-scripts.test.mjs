import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const encryptedBackup = readFileSync(new URL('./encrypted-pg-backup.sh', import.meta.url), 'utf8');
const verifyBackup = readFileSync(new URL('./verify-backup.sh', import.meta.url), 'utf8');

describe('encrypted backup scripts', () => {
  it('creates only encrypted custom-format dump artifacts with checksum', () => {
    assert.match(encryptedBackup, /set -Eeuo pipefail/);
    assert.match(encryptedBackup, /pg_dump/);
    assert.match(encryptedBackup, /--format=custom/);
    assert.match(encryptedBackup, /gpg[\s\S]*--encrypt/);
    assert.match(encryptedBackup, /sha256sum/);
    assert.match(encryptedBackup, /BACKUP_ID/);
    assert.match(encryptedBackup, /A-Za-z0-9/);
    assert.match(encryptedBackup, /rm -rf[\s\S]*trap cleanup EXIT/);
    assert.doesNotMatch(encryptedBackup, /echo.*DATABASE_URL/);
  });

  it('decrypts only into runner temp and verifies restore listing', () => {
    assert.match(verifyBackup, /set -Eeuo pipefail/);
    assert.match(verifyBackup, /gpg[\s\S]*--decrypt/);
    assert.match(verifyBackup, /pg_restore[\s\S]*--list/);
    assert.match(verifyBackup, /rm -rf[\s\S]*trap cleanup EXIT/);
    assert.doesNotMatch(verifyBackup, /--output=.*\.dump/);
  });
});
