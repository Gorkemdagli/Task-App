import './env';
import { maintenancePrisma } from './lib/maintenancePrisma';
import { archiveExpiredTasks } from './services/tasks.archive';

export async function runArchiveBatch(): Promise<{ archivedCount: number }> {
  const tenants = await maintenancePrisma.tenant.findMany({ select: { id: true } });
  let archivedCount = 0;
  const failures: unknown[] = [];

  for (const tenant of tenants) {
    try {
      const result = await maintenancePrisma.$transaction(async (db) => {
        await db.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        const archived = await archiveExpiredTasks(db, tenant.id);
        return { archivedCount: archived.archivedCount };
      });
      archivedCount += result.archivedCount;
    } catch (error) {
      failures.push(error);
      console.error(`[archive-worker] tenant ${tenant.id} failed`, error);
    }
  }

  if (failures.length) {
    throw new AggregateError(failures, `[archive-worker] ${failures.length} tenant(s) failed`);
  }

  return { archivedCount };
}
