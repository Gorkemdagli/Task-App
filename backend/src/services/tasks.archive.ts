import type { TenantDb } from '../db/types';
import { startOfUtcToday } from '../lib/calendarDate';

export async function archiveExpiredTasks(
  db: TenantDb,
  tenantId: string,
): Promise<{ archivedCount: number }> {
  const result = await db.task.updateMany({
    where: {
      team: { tenantId },
      status: 'done',
      deadline: { not: null, lt: startOfUtcToday() },
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  return { archivedCount: result.count };
}
