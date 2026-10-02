# R6 v1 Release Acceptance Implementation Plan

> **For agentic workers:** Use the operational checklist task by task. Do not execute a live provider action without the approvals and change window required by the spec.

**Goal:** Collect sufficient evidence to make an exact-SHA v1.0 go/no-go decision.  
**Architecture:** Render and Vercel deploy independently from their configured production branch (`main`) after protected-branch checks; verify live configuration and operational outcomes, then record evidence in a non-secret release record. GitHub Actions' `production` environment does not gate these provider deployments and is unused unless another Actions workflow needs it.  
**Tech Stack:** GitHub PR/status protection, Vercel, Render, Supabase, Upstash, Sentry, existing TaskFlow CI and release scripts.  
**Spec:** [R6 v1 Release Acceptance Design](../specs/2026-10-02-r6-v1-release-acceptance-design.md)

## Global Constraints

- Work against one explicit target commit SHA; each gate records that SHA.
- Require protected `main` with PR review and passing required CI checks; configure Render auto-deploy after CI checks and Vercel's production branch as `main`.
- Confirm Preview credentials/data are isolated from production and both providers deployed the same SHA.
- Name one migration owner and verify the provider-supported execution point/order plus compatibility with the currently deployed and candidate app versions. If order or compatibility cannot be proven, mark BLOCKED; do not invent provider procedures.
- Missing evidence is BLOCKED; never infer live status from local files.
- Never disclose secrets or restore over the active production database.
- Before copying any production backup data, require a versioned, owner-confirmed runbook procedure, an isolated target with confirmed access restrictions and retention/cleanup, approval of the exact target/command/recovery objectives, explicit operational approval, and an agreed change window. Missing provider facts are a blocker; do not guess.
- Production smoke is read-only and preserves tenant, role, and ownership boundaries.
- Chat and WebSocket are outside R6 v1 acceptance.

## Review Focus

- Provider-native deploys can complete independently — require same-SHA evidence and explicit migration ordering/compatibility.
- GitHub's `production` Actions environment does not protect provider-native deployments; do not count it as a deployment approval gate.
- Environment checks can leak credentials — capture presence/status and links only, never values.
- A disposable local restore can be mistaken for production recovery evidence — label the environment and rehearsal separately.
- Application rollback can be confused with database restore — require separate records and outcomes.
- Smoke can mutate production data — use only the documented read-only requests and check role/tenant denial behavior through the approved critical-flow environment.

---

### Task 1: Verify protected `main` and provider-native deployment settings

**Files:**
- Inspect: GitHub `main` ruleset, Render production service settings, Vercel project settings
- Evidence: GitHub branch protection and provider dashboard deployment history/settings

- [ ] Verify `main` requires PR review and all required CI status checks before merge; prevent direct/force pushes as configured by repository policy.
- [ ] Verify Render's production branch is `main` and auto-deploy runs only after CI checks pass. Confirm critical checks are required in the `main` ruleset because skipped checks may not block a Render deploy.
- [ ] Verify Vercel's Production Branch is `main`; confirm Preview credentials and data are isolated from production.
- [ ] Verify provider deployment history shows Render and Vercel deployed the same exact SHA after the protected merge. Record deployment IDs and evidence links without secrets.
- [ ] Record that GitHub's `production` Actions environment does not gate these provider-native deployments; it is not a PASS condition and may remain unused.
- [ ] Mark BLOCKED if branch protection, provider branch/CI settings, Preview isolation, or matching-SHA evidence is unavailable.

### Task 2: Confirm migration owner, order, and compatibility

**Files:**
- Inspect/update: [R6 production runbook](../../runbooks/r6-production.md), migration scripts and provider-supported deployment settings
- Evidence: Migration validation results, provider configuration, named owner and change record

- [ ] Name one migration owner and record the exact migration SHA and provider-supported execution point/order. Do not assume a provider command or feature; have its owner confirm it.
- [ ] Validate the migration against a disposable database and prove compatibility with both the currently deployed and candidate application versions.
- [ ] Confirm one migration execution only and that the deployment sequence cannot leave incompatible frontend/backend versions live. Prefer additive/expand-contract changes where needed; if order cannot be enforced or compatibility is not proven, mark BLOCKED.
- [ ] Confirm an encrypted backup is verified before any production schema change. Record only non-secret evidence.

### Task 3: Verify live provider and monitoring configuration

**Files:**
- Inspect: [R6 production runbook](../../runbooks/r6-production.md), `scripts/provider-preflight.mjs`, [R6D design](../specs/2026-08-22-r6d-free-tier-deploy-production-gate-design.md)
- Evidence: Provider dashboards and Sentry

- [ ] Verify required configuration in Vercel, Render, Supabase, and Upstash directly in their control planes. Record configured/missing names and evidence references only; do not print secret values.
- [ ] Do not treat GitHub Actions secrets or its `production` environment as provider deployment gates. The existing Actions preflight is not proof of provider dashboard configuration.
- [ ] Verify Sentry frontend/backend artifacts for the target release, the uptime monitor state, and a safe alert delivery signal. Record any missing signal as BLOCKED.

### Task 4: Rehearse application rollback and database recovery separately

**Files:**
- Update and version: [R6 production runbook](../../runbooks/r6-production.md) before any production-data copy
- Follow: [R6 production runbook](../../runbooks/r6-production.md) after its procedure is complete
- Evidence: Vercel/Render deployment history, encrypted backup artifact, isolated recovery database, non-secret rehearsal record

- [ ] First update the runbook with the provider-supported exact restore command and prerequisites; how to identify and verify the isolated recovery target; target access restrictions; approved retention and cleanup steps; post-restore schema/app compatibility and tenant/RLS ownership validation; and secret/PII-free evidence fields. Keep credentials and data dumps out of the runbook. Have the responsible provider owner confirm provider facts and commands. If support or facts cannot be confirmed, stop and mark BLOCKED; do not guess.
- [ ] Confirm the target is isolated from active production and access is restricted; confirm its owner, retention/cleanup plan, and recovery objectives. Approve the exact target and command and the recovery objectives before execution. If any prerequisite is missing, stop and mark BLOCKED. Do not copy customer data without confirmed access controls and cleanup; never overwrite active production or run a down migration.
- [ ] With explicit operational approval and a scheduled change window, rehearse Vercel rollback and Render rollback as separate provider actions. Verify prior-release liveness, readiness, and read-only smoke after each applicable rollback; record deployment IDs and outcomes.
- [ ] Independently verify the encrypted production backup identifier and checksum, then execute the approved runbook restore into the isolated recovery database. Record the restore/job result; target isolation and access controls; schema/app compatibility; tenant/RLS ownership isolation validation (prefer synthetic/non-customer checks where possible); elapsed recovery result against approved objectives; and confirmed cleanup. Keep evidence free of secrets, PII, and data dumps; do not retain plaintext dumps or keys.
- [ ] Keep the existing local disposable-database restore evidence labeled as local rehearsal. It does not satisfy this live/operational gate.

### Task 5: Validate the release candidate and production read-only smoke

**Files:**
- Follow: [R6 production runbook](../../runbooks/r6-production.md), `scripts/production-smoke.mjs`, existing CI workflows
- Evidence: Exact-SHA CI results, critical-flow results, production smoke summary

- [ ] Run the repository's required full CI for the target SHA: quality/performance checks, typecheck, lint, builds, coverage/critical authorization gates, and migration validation as defined by the active workflow. Record linked results.
- [ ] Confirm critical-flow coverage on the designated test environment for role denials, wrong-tenant access, ownership bypass attempts, and core task operations. Do not weaken checks or substitute frontend-only permission checks.
- [ ] After both provider deployments report the same SHA and migration compatibility/order gates pass, run only the R6D read-only production smoke against the verified origins. Confirm health/readiness and documented safe endpoints; perform no registration or production mutation.
- [ ] Record each gate PASS/FAIL/BLOCKED against the same target SHA. A provider SHA mismatch invalidates the candidate evidence and blocks GO until reconciled.

### Task 6: Record the v1.0 decision

**Files:**
- Evidence: A non-secret release record linked from the release candidate

- [ ] Assemble the exact-SHA gate outcomes, timestamps, operator, evidence links, unresolved risks, and required operational approvals in one release record.
- [ ] Record GO only when all spec gates PASS. Otherwise record NO-GO or BLOCKED with the missing/failed evidence and next action; do not imply readiness from local CI alone.

## Completion check

- [ ] Self-review every gate in the [spec](../specs/2026-10-02-r6-v1-release-acceptance-design.md) against its task above.
- [ ] Confirm evidence identifies one SHA across Render and Vercel, no secret values or production data, smoke was read-only, and the restore target was isolated.
- [ ] Confirm the production-data restore procedure was documented and owner-confirmed before execution, the actual isolated restore and validation passed, and cleanup is confirmed. Otherwise record BLOCKED/NO-GO.
- [ ] Confirm the final decision is evidence-backed and linked from the release record.
