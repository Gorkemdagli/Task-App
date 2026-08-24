import './env';
import { maintenancePrisma } from './lib/maintenancePrisma';
import { archiveExpiredTasks } from './services/tasks.archive';

export async function runArchiveBatch(): Promise<{ archivedCount: number }> {
  const tenants = await maintenancePrisma.tenant.findMany({ select: { id: true } });
  let archivedCount = 0;

  for (const tenant of tenants) {
    try {
      const result = await maintenancePrisma.$transaction(async (db) => {
        const archived = await archiveExpiredTasks(db, tenant.id);
        return { archivedCount: archived.archivedCount };
      });
      archivedCount += result.archivedCount;
    } catch (error) {
      console.error(`[archive-worker] tenant ${tenant.id} failed`, error);
    }
  }
  return { archivedCount };
}
