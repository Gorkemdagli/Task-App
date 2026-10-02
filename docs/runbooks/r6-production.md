# R6 Production Runbook

Local operator artifact. Do not commit or push.

## Topology

- Vercel Hobby: Vite frontend and narrow same-origin `/api/v1/auth/*` proxy.
- Render Free: one Node web service, `GET /api/v1/health` liveness, `GET /api/v1/ready` dependency readiness.
- Supabase Free: PostgreSQL and Storage.
- Upstash Redis: runtime sessions, blacklist, and distributed rate limits.
- Upstash QStash: signed hourly `POST /api/v1/internal/archive` delivery.
- Sentry Developer: frontend/backend releases and one best-effort Render uptime monitor.

## Secret locations

Render and Vercel dashboards hold provider/runtime values. Repository files contain names only. GitHub's `production` Actions environment does not gate provider-native deploys; it may remain unused unless another Actions workflow needs it.

- Render: runtime pool URL, direct/maintenance URL, Redis TLS URL, JWT secrets, exact Vercel origin, Supabase Storage service role, Sentry DSN/environment, QStash current/next signing keys. Release comes from Render's runtime commit.
- Vercel: server-only `API_ORIGIN`; public `VITE_API_URL` and frontend Sentry values.
- GitHub Actions: no release/deployment credentials are required for the selected provider-native deploy path. Any Actions secrets kept for separate CI tooling do not gate Render/Vercel production deployments.

Verify production and Preview configuration directly in each provider dashboard; repository checks cannot prove the live settings. The existing `npm run provider:preflight` script validates the former GitHub Actions release configuration and must not be treated as evidence that Render/Vercel branch deploy settings are safe. For a Render shell snapshot, run `node scripts/provider-preflight.mjs render-runtime` with the runtime environment; never print its values.

## Release order

1. Confirm required PR review and `main` CI status checks passed for the exact SHA before merge.
2. Validate the migration on a disposable database; confirm compatibility with the currently deployed and candidate app versions.
3. Create and verify the encrypted backup before any production schema change.
4. Have the named migration owner execute the migration once using the provider-confirmed procedure and approved order. If the procedure/order cannot be confirmed or the migration is not compatible with both app versions during independent deploys, stop; do not guess.
5. Confirm Render auto-deploy is configured for production branch `main` after CI checks pass and verify its health `release` equals the expected SHA/`RENDER_GIT_COMMIT`, then readiness.
6. Confirm Vercel Production Branch is `main`; verify the production deployment reports the same exact SHA as Render. Preview must use isolated credentials/data.
7. Verify Sentry artifacts and run read-only smoke only after migration and both matching-SHA deployments pass. No production registration, upload, invitation, task mutation, or archive execution.

Render and Vercel deploy independently; this runbook does not assume an atomic deploy or invent a provider migration hook. Provider settings and migration owner must establish a safe compatible order before GO. A missing setting, procedure, or same-SHA proof is BLOCKED.

## Local release gates

- `npm run test:coverage --workspace=backend`
- `node scripts/check-critical-coverage.mjs backend/coverage/coverage-final.json`
- `npm run test:coverage --workspace=frontend`
- `npm run e2e`
- `npm run perf:lighthouse:local`
- `bash scripts/backup-rehearsal.sh` (Git Bash on Windows)

The critical authorization gate is 85% per metric. Local E2E and Lighthouse are
localhost-only. The backup rehearsal uses disposable PostgreSQL/GPG containers and
never accepts a production database URL.

## Rollback

1. Stop promotion.
2. Roll Vercel to previous deployment.
3. Roll Render to previous retained build.
4. Verify old release health, readiness, and read-only smoke.
5. Keep additive migrations when previous release remains compatible.
6. Restore database only for confirmed corruption or incompatible destructive change.
7. Rotate implicated credentials; record provider/Sentry/request IDs.

Database rollback is never an automatic down migration.

Application rollback and production smoke remain provider operations: execute them
only after Vercel/Render access, explicit operational approval and change window,
target origins, and dashboard evidence exist. GitHub's Actions `production`
environment does not approve or gate these provider operations. Local rehearsal
does not count as production evidence.

## Restore

- Restore only into disposable database during rehearsal.
- Verify encrypted artifact checksum, decrypt with protected key, then run `pg_restore --list`.
- PostgreSQL dump contains Supabase Storage metadata, not object bytes. Recover Storage objects separately through the documented provider export/recovery process.
- Delete plaintext dump and temporary key immediately after verification.

## Monitoring and limits

- Sentry Uptime: one `GET https://<render>/api/v1/health` monitor, HTTP 200, healthy JSON, email alert.
- Keep-warm is best effort; no SLA. Restarts, suspension, quota exhaustion, or delayed checks can still cold-start Render.
- One active Render Free service consumes roughly 720–744 of 750 monthly hours when continuously warm.
- QStash schedule: `0 * * * *` UTC, exact public Render archive URL, default free retries. No second keep-warm schedule.
- Confirm Render usage-warning email, QStash schedule/retries, Redis TLS connection, Supabase health, Vercel Function/deep links, and both Sentry releases after deployment.
