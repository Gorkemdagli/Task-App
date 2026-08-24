import test from 'node:test';
import assert from 'node:assert/strict';
import { getMissingProviderValues, PROVIDER_PROFILES } from './provider-preflight.mjs';

test('provider preflight reports names only', () => {
  const missing = getMissingProviderValues(
    { RENDER_ORIGIN: 'https://api.example.test', VERCEL_TOKEN: 'token' },
    'github-release',
  );

  assert.deepEqual(missing, [
    'SUPABASE_MIGRATION_URL',
    'BACKUP_PUBLIC_RECIPIENT',
    'BACKUP_PRIVATE_KEY',
    'RENDER_DEPLOY_HOOK',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'API_ORIGIN',
    'VITE_API_URL',
    'VITE_SENTRY_DSN',
    'VITE_SENTRY_ENVIRONMENT',
  ]);
});

test('profiles contain no secret values', () => {
  assert.ok(PROVIDER_PROFILES['github-release'].includes('BACKUP_PRIVATE_KEY'));
  assert.ok(PROVIDER_PROFILES['render-runtime'].includes('JWT_ACCESS_SECRET'));
  assert.ok(PROVIDER_PROFILES['render-runtime'].includes('QSTASH_CURRENT_SIGNING_KEY'));
});
