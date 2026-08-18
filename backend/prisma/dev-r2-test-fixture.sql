-- Local/dev only. Creates browser-test data for R2 role and multi-assignee flows.
-- Test password: R2Test!2026

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Remove only this fixture tenant, making the script repeatable.
DELETE FROM "tenants" WHERE "slug" = 'r2-manual-test';
DELETE FROM "users"
WHERE "email" IN (
  'r2-admin@taskflow.local',
  'r2-teamadmin@taskflow.local',
  'r2-member1@taskflow.local',
  'r2-member2@taskflow.local'
);

INSERT INTO "tenants" ("id", "name", "slug", "updated_at")
VALUES ('00000000-0000-0000-0000-000000002201', 'R2 Manual Test', 'r2-manual-test', NOW());

INSERT INTO "users" (
  "id", "tenant_id", "email", "full_name", "password_hash", "display_id", "role", "updated_at"
)
VALUES
  ('00000000-0000-0000-0000-000000002202', '00000000-0000-0000-0000-000000002201', 'r2-admin@taskflow.local', 'R2 Company Admin', crypt('R2Test!2026', gen_salt('bf', 12)), 'R2A01', 'companyAdmin', NOW()),
  ('00000000-0000-0000-0000-000000002203', '00000000-0000-0000-0000-000000002201', 'r2-teamadmin@taskflow.local', 'R2 Team Admin', crypt('R2Test!2026', gen_salt('bf', 12)), 'R2TA1', 'member', NOW()),
  ('00000000-0000-0000-0000-000000002204', '00000000-0000-0000-0000-000000002201', 'r2-member1@taskflow.local', 'R2 Member One', crypt('R2Test!2026', gen_salt('bf', 12)), 'R2M01', 'member', NOW()),
  ('00000000-0000-0000-0000-000000002205', '00000000-0000-0000-0000-000000002201', 'r2-member2@taskflow.local', 'R2 Member Two', crypt('R2Test!2026', gen_salt('bf', 12)), 'R2M02', 'member', NOW());

INSERT INTO "teams" ("id", "tenant_id", "name", "description", "updated_at")
VALUES ('00000000-0000-0000-0000-000000002206', '00000000-0000-0000-0000-000000002201', 'R2 QA Team', 'Manual R2 browser testing team', NOW());

INSERT INTO "team_members" ("team_id", "user_id", "role")
VALUES
  ('00000000-0000-0000-0000-000000002206', '00000000-0000-0000-0000-000000002202', 'member'),
  ('00000000-0000-0000-0000-000000002206', '00000000-0000-0000-0000-000000002203', 'teamAdmin'),
  ('00000000-0000-0000-0000-000000002206', '00000000-0000-0000-0000-000000002204', 'member'),
  ('00000000-0000-0000-0000-000000002206', '00000000-0000-0000-0000-000000002205', 'member');

INSERT INTO "channels" ("id", "team_id", "name", "type")
VALUES ('00000000-0000-0000-0000-000000002207', '00000000-0000-0000-0000-000000002206', 'r2-testing', 'team');

INSERT INTO "tasks" ("id", "team_id", "title", "description", "status", "priority", "assigner_id", "updated_at")
VALUES
  ('00000000-0000-0000-0000-000000002208', '00000000-0000-0000-0000-000000002206', 'R2 Multi-assignee direct test', 'Three assignees. Use for status proposal and acknowledgement testing.', 'todo', 'high', '00000000-0000-0000-0000-000000002202', NOW()),
  ('00000000-0000-0000-0000-000000002209', '00000000-0000-0000-0000-000000002206', 'R2 Pending acknowledgement test', 'External company-admin proposal. All current assignees must acknowledge.', 'todo', 'medium', '00000000-0000-0000-0000-000000002202', NOW()),
  ('00000000-0000-0000-0000-000000002210', '00000000-0000-0000-0000-000000002206', 'R2 Single-assignee direct test', 'Single assignee. Use for direct status update testing.', 'todo', 'low', '00000000-0000-0000-0000-000000002202', NOW());

INSERT INTO "task_assignees" ("id", "task_id", "user_id")
VALUES
  ('00000000-0000-0000-0000-000000002211', '00000000-0000-0000-0000-000000002208', '00000000-0000-0000-0000-000000002203'),
  ('00000000-0000-0000-0000-000000002212', '00000000-0000-0000-0000-000000002208', '00000000-0000-0000-0000-000000002204'),
  ('00000000-0000-0000-0000-000000002213', '00000000-0000-0000-0000-000000002208', '00000000-0000-0000-0000-000000002205'),
  ('00000000-0000-0000-0000-000000002214', '00000000-0000-0000-0000-000000002209', '00000000-0000-0000-0000-000000002203'),
  ('00000000-0000-0000-0000-000000002215', '00000000-0000-0000-0000-000000002209', '00000000-0000-0000-0000-000000002204'),
  ('00000000-0000-0000-0000-000000002216', '00000000-0000-0000-0000-000000002209', '00000000-0000-0000-0000-000000002205'),
  ('00000000-0000-0000-0000-000000002217', '00000000-0000-0000-0000-000000002210', '00000000-0000-0000-0000-000000002204');

UPDATE "tasks"
SET "pending_status" = 'in_progress', "pending_version" = 1, "pending_proposed_by" = '00000000-0000-0000-0000-000000002202', "pending_proposed_at" = NOW()
WHERE "id" = '00000000-0000-0000-0000-000000002209';

COMMIT;
