#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const PROVIDER_PROFILES = Object.freeze({
  'github-release': Object.freeze([
    'SUPABASE_MIGRATION_URL',
    'BACKUP_PUBLIC_RECIPIENT',
    'BACKUP_PRIVATE_KEY',
    'RENDER_DEPLOY_HOOK',
    'RENDER_ORIGIN',
    'VERCEL_TOKEN',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'API_ORIGIN',
    'VITE_API_URL',
    'VITE_SENTRY_DSN',
    'VITE_SENTRY_ENVIRONMENT',
  ]),
  'render-runtime': Object.freeze([
    'DATABASE_URL',
    'APP_DATABASE_URL',
    'MAINTENANCE_DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'CLIENT_URL',
    'PUBLIC_API_ORIGIN',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SENTRY_DSN',
    'SENTRY_ENVIRONMENT',
  ]),
});

export function getMissingProviderValues(values, profile = 'github-release') {
  const required = PROVIDER_PROFILES[profile];
  if (!required) throw new Error(`Unknown provider preflight profile: ${profile}`);
  return required.filter((name) => !String(values[name] ?? '').trim());
}

export function assertProviderPreflight(values, profile = 'github-release') {
  const missing = getMissingProviderValues(values, profile);
  if (missing.length > 0) {
    throw new Error(
      `Provider preflight failed (${profile}); missing names: ${missing.join(', ')}`,
    );
  }
  return { profile, checked: PROVIDER_PROFILES[profile].length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const profile = process.argv[2] ?? 'github-release';
  try {
    const result = assertProviderPreflight(process.env, profile);
    console.log(`provider preflight passed: ${result.profile} (${result.checked} names)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Provider preflight failed');
    process.exitCode = 1;
  }
}
