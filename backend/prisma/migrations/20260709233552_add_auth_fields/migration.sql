-- AlterTable
ALTER TABLE "users" ADD COLUMN     "display_id" TEXT NOT NULL,
ADD COLUMN     "password_hash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_display_id_key" ON "users"("display_id");
