CREATE OR REPLACE FUNCTION public."enforce_company_invitation_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."recipient_user_id" IS DISTINCT FROM OLD."recipient_user_id"
    OR NEW."invited_by_user_id" IS DISTINCT FROM OLD."invited_by_user_id"
    OR NEW."company_name" IS DISTINCT FROM OLD."company_name"
    OR NEW."inviter_name" IS DISTINCT FROM OLD."inviter_name"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN
    RAISE EXCEPTION 'Company invitation immutable fields cannot be changed';
  END IF;

  IF OLD."recipient_user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND OLD."status" = 'pending'
    AND NEW."status" = 'accepted'
    AND OLD."expires_at" > CURRENT_TIMESTAMP
    AND NEW."responded_at" IS NOT NULL
    AND NEW."cancelled_at" IS NOT DISTINCT FROM OLD."cancelled_at"
    AND EXISTS (
      SELECT 1
      FROM public."users" recipient
      WHERE recipient."id" = OLD."recipient_user_id"
        AND recipient."tenant_id" = OLD."tenant_id"
        AND recipient."role" = 'member'
    ) THEN
    RETURN NEW;
  END IF;

  IF OLD."recipient_user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND OLD."status" = 'pending'
    AND NEW."status" = 'rejected'
    AND OLD."expires_at" > CURRENT_TIMESTAMP
    AND NEW."responded_at" IS NOT NULL
    AND NEW."cancelled_at" IS NOT DISTINCT FROM OLD."cancelled_at" THEN
    RETURN NEW;
  END IF;

  IF OLD."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND OLD."status" = 'pending'
    AND NEW."status" = 'cancelled'
    AND NEW."responded_at" IS NOT DISTINCT FROM OLD."responded_at"
    AND NEW."cancelled_at" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'pending'
    AND NEW."status" = 'expired'
    AND (
      OLD."expires_at" <= CURRENT_TIMESTAMP
      OR EXISTS (
        SELECT 1
        FROM public."users" recipient
        WHERE recipient."id" = OLD."recipient_user_id"
          AND recipient."tenant_id" IS NOT NULL
      )
    )
    AND NEW."responded_at" IS NOT DISTINCT FROM OLD."responded_at"
    AND NEW."cancelled_at" IS NOT DISTINCT FROM OLD."cancelled_at" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid company invitation status transition';
END;
$$;

REVOKE ALL ON FUNCTION public."enforce_company_invitation_update"() FROM PUBLIC;

DROP POLICY IF EXISTS "company_invitations_select" ON "company_invitations";

CREATE POLICY "company_invitations_select" ON "company_invitations"
  FOR SELECT TO authenticated
  USING (
    "recipient_user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

DROP POLICY IF EXISTS "company_invitations_tenant_update" ON "company_invitations";

CREATE POLICY "company_invitations_tenant_update" ON "company_invitations"
  FOR UPDATE TO authenticated
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
