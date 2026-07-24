import { prisma } from '../lib/prisma';
import { notifyTaskStatusChanged } from '../lib/notifications';

/**
 * "Yapıldı" + deadline geçmiş + henüz arşivlenmemiş görevleri arşive taşır.
 * Pure function: cron ve admin endpoint aynı kodu çağırır, test kolay.
 */
export async function archiveExpiredTasks(): Promise<{ archivedCount: number }> {
  const now = new Date();
  const result = await prisma.task.updateMany({
    where: {
      status: 'done',
      deadline: { not: null, lt: now },
      archivedAt: null,
    },
    data: {
      archivedAt: now,
    },
  });
  return { archivedCount: result.count };
}

/**
 * Deadline geçmiş + pending status teklifi olan görevleri otomatik uygular.
 * Tüm assignees'e `task_status_changed` bildirimi gönderir.
 */
export async function applyExpiredPendingStatuses(): Promise<{ appliedCount: number }> {
  const now = new Date();
  const pending = await prisma.task.findMany({
    where: {
      pendingStatus: { not: null },
      deadline: { not: null, lt: now },
    },
    include: {
      assignees: { select: { userId: true } },
    },
  });

  let appliedCount = 0;

  for (const task of pending) {
    if (task.pendingStatus === null) continue;

    const applyStatus = task.pendingStatus;
    const proposerId = task.pendingProposedBy;

    await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: {
          status: applyStatus,
          pendingStatus: null,
          pendingProposedBy: null,
          pendingProposedAt: null,
        },
      }),
      prisma.taskStatusAck.deleteMany({ where: { taskId: task.id } }),
    ]);

    const recipientIds = task.assignees.map((a) => a.userId);
    await notifyTaskStatusChanged(
      recipientIds,
      task,
      task.status,
      applyStatus,
      proposerId ?? '__system__',
    );
    appliedCount++;
  }

  return { appliedCount };
}
