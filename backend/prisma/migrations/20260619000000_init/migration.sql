-- CreateTable
CREATE TABLE "_health_checks" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_health_checks_pkey" PRIMARY KEY ("id")
);
