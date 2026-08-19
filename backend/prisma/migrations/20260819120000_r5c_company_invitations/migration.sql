-- CreateEnum
CREATE TYPE "CompanyInvitationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "company_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "status" "CompanyInvitationStatus" NOT NULL DEFAULT 'pending',
    "company_name" TEXT NOT NULL,
    "inviter_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_invitations_tenant_id_status_idx"
ON "company_invitations" ("tenant_id", "status");

-- CreateIndex
CREATE INDEX "company_invitations_recipient_user_id_status_expires_at_idx"
ON "company_invitations" ("recipient_user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_invitations_one_pending"
ON "company_invitations" ("tenant_id", "recipient_user_id")
WHERE "status" = 'pending'::"CompanyInvitationStatus";

-- AddForeignKey
ALTER TABLE "company_invitations"
ADD CONSTRAINT "company_invitations_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_invitations"
ADD CONSTRAINT "company_invitations_recipient_user_id_fkey"
FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_invitations"
ADD CONSTRAINT "company_invitations_invited_by_user_id_fkey"
FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "company_invitations" TO authenticated;

ALTER TABLE "company_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_invitations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "company_invitations_select" ON "company_invitations"
  FOR SELECT TO authenticated
  USING (
    "recipient_user_id" = current_setting('app.user_id', true)::uuid
    OR "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY "company_invitations_insert" ON "company_invitations"
  FOR INSERT TO authenticated
  WITH CHECK (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    AND "invited_by_user_id" = current_setting('app.user_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM "users" recipient
      WHERE recipient."id" = "company_invitations"."recipient_user_id"
        AND recipient."tenant_id" IS NULL
    )
  );

CREATE POLICY "company_invitations_recipient_update" ON "company_invitations"
  FOR UPDATE TO authenticated
  USING ("recipient_user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("recipient_user_id" = current_setting('app.user_id', true)::uuid);

CREATE POLICY "company_invitations_tenant_update" ON "company_invitations"
  FOR UPDATE TO authenticated
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "company_invitations_tenant_delete" ON "company_invitations"
  FOR DELETE TO authenticated
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
