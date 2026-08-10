import type { TenantDb } from '../db/types';
import { notifyTaskStatusChanged } from '../lib/notifications';

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

export async function applyExpiredPendingStatuses(
  db: TenantDb,
  tenantId: string,
): Promise<{ appliedCount: number }> {
  const pending = await db.task.findMany({
    where: {
      team: { tenantId },
      pendingStatus: { not: null },
      deadline: { not: null, lt: new Date() },
    },
    include: { assignees: { select: { userId: true } } },
  });

  let appliedCount = 0;
  for (const task of pending) {
    if (task.pendingStatus === null) continue;
    const applyStatus = task.pendingStatus;
    const proposerId = task.pendingProposedBy;
    await db.task.update({
      where: { id: task.id },
      data: {
        status: applyStatus,
        pendingStatus: null,
        pendingProposedBy: null,
        pendingProposedAt: null,
      },
    });
    await db.taskStatusAck.deleteMany({ where: { taskId: task.id } });
    await notifyTaskStatusChanged(
      db,
      task.assignees.map((assignee) => assignee.userId),
      task,
      task.status,
      applyStatus,
      proposerId ?? '__system__',
    );
    appliedCount++;
  }
  return { appliedCount };
}
