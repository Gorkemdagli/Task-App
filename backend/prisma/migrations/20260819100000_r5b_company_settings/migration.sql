ALTER TABLE "tenants" ADD COLUMN "description" TEXT;
ALTER TABLE "tenants" ADD COLUMN "name_key" TEXT;
UPDATE "tenants" SET "name_key" = "slug";
ALTER TABLE "tenants" ALTER COLUMN "name_key" SET NOT NULL;
CREATE UNIQUE INDEX "tenants_name_key_key" ON "tenants"("name_key");
