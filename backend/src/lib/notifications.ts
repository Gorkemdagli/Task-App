import { prisma } from './prisma';
import type { NotificationType } from '@prisma/client';

/**
 * Tek bir kullanıcıya notification kaydı ekler. Gösterim UI'ı faz 6'da gelecek.
 * Çağıran, hedef user'ın tenant'ından olduğunu doğrulamalı (kendi route'ında).
 */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type,
      payload: payload as object,
    },
  });
}

/** Task atandığında assignee'e bildirim. (Yeni oluşturma veya assignee değişiminde çağrılır.) */
export async function notifyTaskAssigned(
  assigneeId: string,
  taskId: string,
  taskTitle: string,
): Promise<void> {
  if (!assigneeId) return;
  await notifyUser(assigneeId, 'task_assigned', { taskId, taskTitle });
}

/**
 * Yorum eklendiğinde: assigner + assignee + önceki yorum yazarlarına bildirim.
 * Yorumu yazan kişi kendisine bildirim almaz.
 */
export async function notifyTaskCommented(
  task: { id: string; title: string; assignerId: string; assigneeId: string },
  commentAuthorId: string,
): Promise<void> {
  const recipientIds = new Set<string>();
  if (task.assignerId !== commentAuthorId) recipientIds.add(task.assignerId);
  if (task.assigneeId !== commentAuthorId) recipientIds.add(task.assigneeId);

  const priorCommenters = await prisma.taskComment.findMany({
    where: {
      taskId: task.id,
      authorId: { not: commentAuthorId },
    },
    select: { authorId: true },
    distinct: ['authorId'],
  });
  for (const c of priorCommenters) {
    recipientIds.add(c.authorId);
  }

  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      notifyUser(userId, 'task_commented', { taskId: task.id, taskTitle: task.title }),
    ),
  );
}
