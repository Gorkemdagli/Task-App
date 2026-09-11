import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const maintenanceDatabaseUrl =
  process.env.MAINTENANCE_DATABASE_URL ||
  (process.env.NODE_ENV !== 'production' ? process.env.DATABASE_URL : undefined);
if (!maintenanceDatabaseUrl) {
  throw new Error('MAINTENANCE_DATABASE_URL is required for the archive worker');
}

const adapter = new PrismaPg({ connectionString: maintenanceDatabaseUrl });

export const maintenancePrisma = new PrismaClient({ adapter });
