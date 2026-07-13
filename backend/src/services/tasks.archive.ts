import { prisma } from '../lib/prisma';

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
