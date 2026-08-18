-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_fkey";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data cleanup: register'da companyName verilmemiş user'lar için oluşturulan
-- "(Kişisel)" tenant'ları sil. ON DELETE SET NULL sayesinde bu user'ların
-- tenant_id'si otomatik NULL olur (tenantless state). Artık admin bu
-- user'ları kendi tenant'larına davet edebilir (transfer).
DELETE FROM "tenants" WHERE "name" LIKE '%(Kişisel)%';
