# R6 v1 Release Acceptance Design

**Date:** 2026-10-02  
**Status:** Approved for planning  
**Parent phase:** R6 — QA ve Production  
**Depends on:** R6D free-tier deploy production gate

## Goal

Define the evidence required to decide whether the R6 release is ready for a v1.0 production release. This document closes the acceptance gap; it does not redesign deployment or assert that any live gate has passed.

## Current evidence

The R6 checklist records local implementation and CI evidence, including encrypted backup restoration into a disposable database. It still lists provider setup, Sentry/uptime, provider rollback and restore drills, production read-only smoke, and final release evidence as open. The selected release path is provider-native deployment from protected `main`: Render and Vercel deploy independently from their configured production branch. The repository's inert `release.yml.example` is not part of that path. Repository evidence cannot establish current provider settings, credentials, branch protections, alerts, or completed production rehearsals. GitHub's `production` Actions environment does not gate Render/Vercel deployments and may remain unused unless another Actions workflow needs it.

The existing deployment contract and procedures remain authoritative: [R6D design](2026-08-22-r6d-free-tier-deploy-production-gate-design.md), [R6D plan](../plans/2026-08-22-r6d-free-tier-deploy-production-gate.md), and [R6 production runbook](../../runbooks/r6-production.md). This design adds acceptance criteria only.

## Scope

Establish ordered evidence gates for:

1. Protected `main` and provider-native production branch deployment settings for the exact target SHA.
2. Live provider configuration and release prerequisites, including Preview isolation.
3. One explicit migration owner/order and backward/forward compatibility across the deployed and candidate application versions.
4. Separate application rollback and database backup/restore rehearsals.
5. Monitoring signals and alerts.
6. Full current-SHA CI, critical tenant/ownership flows, matching Render/Vercel deploy SHAs, and production read-only smoke.
7. An evidence-backed v1.0 go/no-go decision.

Chat and WebSocket remain V2 and are excluded. Deployment topology, application features, provider provisioning, and execution of production operations are outside this acceptance design.

## Release gates and acceptance evidence

Each gate is **PASS**, **BLOCKED**, or **FAIL**, with target SHA, timestamp, operator, and non-secret evidence references recorded in the release record. Missing evidence is BLOCKED, never inferred as PASS.

| Gate | PASS evidence |
| --- | --- |
| Deployment | `main` requires PR review and the required CI status checks. Render production branch is `main` with auto-deploy after CI checks pass; Vercel production branch is `main`. Verify both providers deployed the same exact SHA. Render's treatment of skipped checks is accounted for by the required GitHub branch checks. |
| Live environment | Required Vercel, Render, Supabase, and Redis/QStash production settings are verified in their control planes; Preview credentials/data are isolated from production. GitHub's `production` Actions environment is not a provider deployment gate. Record configuration names/status and evidence links only; never copy secret values. |
| Migration | A named owner and provider-supported execution point/order are recorded. The migration is validated against a disposable database and is compatible with both the currently deployed and candidate app versions. If execution order cannot be enforced or compatibility is unproven, the gate is BLOCKED. |
| Monitoring | Frontend/backend release artifacts are associated with the target release; Sentry uptime monitor is enabled and its alert route is verified by a safe signal. |
| Recovery | Application rollback is rehearsed independently for Vercel and Render, then prior-release health/readiness and read-only smoke are checked. Before copying production backup data, the versioned runbook documents a provider-supported exact restore command, isolated target, restricted access, retention and cleanup, validation, and secret/PII-free evidence. The exact target, command, and recovery objectives are approved before execution. A successful restore into that isolated target is validated for schema/app compatibility and tenant/RLS ownership isolation, measured against the approved objectives, and cleaned up with evidence. A prior local restore into a disposable database is local evidence only, not a live-environment rehearsal. If provider facts, safe isolation, access restrictions, or cleanup cannot be confirmed, recovery is BLOCKED and GO is prohibited. |
| Release candidate | Required full CI succeeds on the exact SHA, including applicable typecheck, lint, build, coverage, migration and critical-flow gates. Critical flows cover role authorization, tenant isolation, ownership, and core task operations. Render and Vercel report that same SHA after deployment. Production smoke follows the runbook and is strictly read-only. |
| Decision | All preceding gates PASS, evidence is linked, unresolved incidents/risks are stated, and the authorized release decision is recorded as GO or NO-GO. |

## Decision rule

GO requires every gate above to PASS for one exact SHA and the required operational approvals to be recorded. Any missing provider fact, evidence, recovery target, agreed recovery objective, failed check, or unresolved safety question blocks GO. Do not invent recovery objectives or select a recovery target by assumption. A NO-GO or BLOCKED decision records the failed/missing gate and next evidence needed.

## Safety boundaries

- Preserve tenant isolation, ownership checks, and backend authorization in every critical-flow check.
- Provider-native deployments can proceed independently after a protected `main` update. Migration ordering and backward/forward compatibility must prevent mixed frontend/backend versions from breaking production; missing provider facts or an unenforceable order blocks GO.
- Production smoke may only perform the non-mutating requests defined by the R6D runbook; it must not register users or mutate tasks, roles, invitations, uploads, notifications, or archives.
- Never restore over the active production database. Restore only into an isolated, verified recovery target. Live provider actions require explicit operational approval and an agreed change window.
- Do not copy customer data until the isolated target's access restrictions and retention/cleanup plan are confirmed. Approve the exact restore target, command, and recovery objectives before execution; provider-specific facts or commands that lack owner confirmation are a blocker, not a prompt to guess.
- Treat application rollback and database recovery as distinct procedures. Do not run automatic/down migrations as rollback.
- Record backup identifier and checksum, target isolation/access controls, restore/job result, schema/app compatibility, tenant/RLS ownership isolation validation (use synthetic/non-customer checks where possible), elapsed recovery time against approved objectives, and confirmed cleanup. Do not expose, log, or attach secret values, personal data, or plaintext database dumps to the evidence record.
