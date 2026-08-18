-- Local/dev only. Removes only the R2 manual-test tenant and its cascaded data.
BEGIN;
DELETE FROM "tenants" WHERE "slug" = 'r2-manual-test';
COMMIT;
