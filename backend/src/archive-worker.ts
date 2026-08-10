import cron from 'node-cron';
import { maintenancePrisma } from './lib/maintenancePrisma';
import { applyExpiredPendingStatuses, archiveExpiredTasks } from './services/tasks.archive';

export async function runArchiveBatch(): Promise<{ archivedCount: number; appliedCount: number }> {
  const tenants = await maintenancePrisma.tenant.findMany({ select: { id: true } });
  let archivedCount = 0;
  let appliedCount = 0;

  for (const tenant of tenants) {
    try {
      const result = await maintenancePrisma.$transaction(async (db) => {
        const archived = await archiveExpiredTasks(db, tenant.id);
        const applied = await applyExpiredPendingStatuses(db, tenant.id);
        return { archivedCount: archived.archivedCount, appliedCount: applied.appliedCount };
      });
      archivedCount += result.archivedCount;
      appliedCount += result.appliedCount;
    } catch (error) {
      console.error(`[archive-worker] tenant ${tenant.id} failed`, error);
    }
  }
  return { archivedCount, appliedCount };
}

export function startArchiveWorker(): ReturnType<typeof cron.schedule> {
  const job = cron.schedule('0 * * * *', () => {
    void runArchiveBatch();
  });
  return job;
}

if (require.main === module) {
  startArchiveWorker();
  console.log('[archive-worker] started');
}
