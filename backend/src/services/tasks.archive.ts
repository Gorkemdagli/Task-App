import type { TenantDb } from '../db/types';

export async function archiveExpiredTasks(
  db: TenantDb,
  tenantId: string,
): Promise<{ archivedCount: number }> {
  const result = await db.task.updateMany({
    where: {
      team: { tenantId },
      status: 'done',
      deadline: { not: null, lt: new Date() },
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  return { archivedCount: result.count };
}
