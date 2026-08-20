import type { TenantDb } from '../db/types';
import { startOfUtcToday } from '../lib/calendarDate';

const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;

export async function archiveExpiredTasks(
  db: TenantDb,
  tenantId: string,
): Promise<{ archivedCount: number }> {
  const archiveDeadline = new Date(startOfUtcToday().getTime() - 7 * CALENDAR_DAY_MS);
  const result = await db.task.updateMany({
    where: {
      team: { tenantId },
      deadline: { not: null, lte: archiveDeadline },
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  return { archivedCount: result.count };
}
