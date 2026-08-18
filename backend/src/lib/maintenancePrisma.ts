import { PrismaClient } from '@prisma/client';

const maintenanceDatabaseUrl = process.env.MAINTENANCE_DATABASE_URL;
if (!maintenanceDatabaseUrl) {
  throw new Error('MAINTENANCE_DATABASE_URL is required for the archive worker');
}

export const maintenancePrisma = new PrismaClient({
  datasources: { db: { url: maintenanceDatabaseUrl } },
});
