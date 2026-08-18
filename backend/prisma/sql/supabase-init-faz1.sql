-- ============================================================
-- TaskFlow Faz 1 — Supabase Cloud Deploy
-- ============================================================
-- Kullanim: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Idempotent: tekrar calistirilabilir (DROP + CREATE)
--
-- Icerik:
--   1. CLEANUP (DROP IF EXISTS)
--   2. 6 ENUM
--   3. 9 TABLO (tenants, users, teams, team_members, tasks, task_comments, channels, messages, notifications)
--   4. 12 INDEX (composite + tenant_id + FK)
--   5. 14 FOREIGN KEY
--   6. 1 CHECK CONSTRAINT (messages.channel_id XOR receiver_id)
--   7. 9 RLS ENABLE
--   8. 9 RLS POLICY (current_setting('app.tenant_id') pattern)
--   9. 9 GRANT (authenticated rolune schema + table haklari)
-- ============================================================

-- ============================================================
-- 1. CLEANUP
-- ============================================================
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "channels" CASCADE;
DROP TABLE IF EXISTS "task_comments" CASCADE;
DROP TABLE IF EXISTS "tasks" CASCADE;
DROP TABLE IF EXISTS "team_members" CASCADE;
DROP TABLE IF EXISTS "teams" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "tenants" CASCADE;
DROP TABLE IF EXISTS "_health_checks" CASCADE;

DROP TYPE IF EXISTS "NotificationType" CASCADE;
DROP TYPE IF EXISTS "ChannelType" CASCADE;
DROP TYPE IF EXISTS "TaskPriority" CASCADE;
DROP TYPE IF EXISTS "TaskStatus" CASCADE;
DROP TYPE IF EXISTS "TeamMemberRole" CASCADE;
DROP TYPE IF EXISTS "UserRole" CASCADE;

-- ============================================================
-- 2. ENUMS
-- ============================================================
CREATE TYPE "UserRole" AS ENUM ('member', 'teamAdmin', 'companyAdmin');

CREATE TYPE "TeamMemberRole" AS ENUM ('member', 'teamAdmin');

CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'done');

CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high');

CREATE TYPE "ChannelType" AS ENUM ('team', 'dm');

CREATE TYPE "NotificationType" AS ENUM ('task_assigned', 'task_commented', 'message_received');

-- ============================================================
-- 3. TABLES
-- ============================================================
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_members" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TeamMemberRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "deadline" TIMESTAMPTZ(6),
    "assigner_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "channel_id" UUID,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 4. INDEXES
-- ============================================================
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

CREATE INDEX "teams_tenant_id_idx" ON "teams"("tenant_id");

CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

CREATE INDEX "tasks_team_id_status_idx" ON "tasks"("team_id", "status");

CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

CREATE INDEX "tasks_deadline_idx" ON "tasks"("deadline");

CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at" DESC);

CREATE INDEX "channels_team_id_idx" ON "channels"("team_id");

CREATE INDEX "messages_channel_id_created_at_idx" ON "messages"("channel_id", "created_at" DESC);

CREATE INDEX "messages_receiver_id_read_at_idx" ON "messages"("receiver_id", "read_at");

CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- ============================================================
-- 5. FOREIGN KEYS
-- ============================================================
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigner_id_fkey" FOREIGN KEY ("assigner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "channels" ADD CONSTRAINT "channels_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 6. CHECK CONSTRAINTS
-- ============================================================
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_or_receiver_check"
  CHECK (("channel_id" IS NOT NULL) OR ("receiver_id" IS NOT NULL));

-- ============================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE "tenants"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teams"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_members"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_comments"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "channels"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. RLS POLICIES (current_setting('app.tenant_id') pattern)
-- ============================================================
-- RLS politikasi authenticated rolune uygulanir.
-- Service-role (Prisma backend) SET LOCAL ile context enjekte ederek RLS'i gecer.
-- Authenticated client (Supabase Auth JWT) tenant_id'yi user metadata'dan alir.

-- tenants: kullanici sadece kendi tenant satirini gorebilir
CREATE POLICY tenant_isolation ON "tenants"
  FOR ALL TO authenticated
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- users: ayni tenant'taki kullanicilar
CREATE POLICY tenant_isolation ON "users"
  FOR ALL TO authenticated
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- teams: tenant bazli
CREATE POLICY tenant_isolation ON "teams"
  FOR ALL TO authenticated
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- team_members: parent team uzerinden tenant kontrolu
CREATE POLICY tenant_isolation ON "team_members"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "teams" t
      WHERE t.id = "team_members"."team_id"
        AND t."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

-- tasks: parent team uzerinden tenant kontrolu
CREATE POLICY tenant_isolation ON "tasks"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "teams" t
      WHERE t.id = "tasks"."team_id"
        AND t."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

-- task_comments: parent task -> team uzerinden tenant kontrolu
CREATE POLICY tenant_isolation ON "task_comments"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "tasks" t
      JOIN "teams" tm ON tm.id = t."team_id"
      WHERE t.id = "task_comments"."task_id"
        AND tm."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

-- channels: parent team uzerinden tenant kontrolu
CREATE POLICY tenant_isolation ON "channels"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "teams" t
      WHERE t.id = "channels"."team_id"
        AND t."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

-- messages: ya channel uzerinden ya da receiver uzerinden tenant kontrolu
CREATE POLICY tenant_isolation ON "messages"
  FOR ALL TO authenticated
  USING (
    (
      "channel_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "channels" c
        JOIN "teams" t ON t.id = c."team_id"
        WHERE c.id = "messages"."channel_id"
          AND t."tenant_id" = current_setting('app.tenant_id', true)::uuid
      )
    )
    OR
    (
      "receiver_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "users" u
        WHERE u.id = "messages"."receiver_id"
          AND u."tenant_id" = current_setting('app.tenant_id', true)::uuid
      )
    )
  );

-- notifications: user uzerinden tenant kontrolu
CREATE POLICY tenant_isolation ON "notifications"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u.id = "notifications"."user_id"
        AND u."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

-- ============================================================
-- 9. GRANT — authenticated rolune schema + tablo erisim haklari
-- (RLS policy olsa bile authenticated role once schema/tabloyu kullanabilmeli)
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Yeni eklenen tablolar icin de ayni haklar
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ============================================================
-- Sonuc: 9 tablo + 6 enum + 12 index + 14 FK + 1 CHECK + RLS x9 + 9 policy + 9 GRANT
-- ============================================================
