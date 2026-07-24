import { prisma } from './prisma';
import type { NotificationType, TaskStatus } from '@prisma/client';

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
 * Yorum eklendiğinde: assigner + tüm assignees + önceki yorum yazarlarına bildirim.
 * Yorumu yazan kişi kendisine bildirim almaz.
 */
export async function notifyTaskCommented(
  task: { id: string; title: string; assignerId: string; assigneeIds: string[] },
  commentAuthorId: string,
): Promise<void> {
  const recipientIds = new Set<string>();
  if (task.assignerId !== commentAuthorId) recipientIds.add(task.assignerId);
  for (const uid of task.assigneeIds) {
    if (uid !== commentAuthorId) recipientIds.add(uid);
  }

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

/**
 * Multi-assignee status teklifinde ack bekleyen assignees'e bildirim.
 * Teklif eden kişi (proposer) kendine bildirim almaz.
 */
export async function notifyTaskStatusPending(
  recipientIds: string[],
  task: { id: string; title: string },
  proposedStatus: TaskStatus,
  proposedById: string,
  proposedByName: string,
): Promise<void> {
  const targets = new Set<string>();
  for (const uid of recipientIds) {
    if (uid !== proposedById) targets.add(uid);
  }
  await Promise.all(
    Array.from(targets).map((userId) =>
      notifyUser(userId, 'task_status_pending', {
        taskId: task.id,
        taskTitle: task.title,
        proposedStatus,
        proposedBy: proposedById,
        proposedByName,
      }),
    ),
  );
}

/**
 * Status değişikliği tüm assignees'e bildirim (actor hariç).
 */
export async function notifyTaskStatusChanged(
  recipientIds: string[],
  task: { id: string; title: string },
  oldStatus: TaskStatus,
  newStatus: TaskStatus,
  actorId: string,
): Promise<void> {
  const targets = new Set<string>();
  for (const uid of recipientIds) {
    if (uid !== actorId) targets.add(uid);
  }
  await Promise.all(
    Array.from(targets).map((userId) =>
      notifyUser(userId, 'task_status_changed', {
        taskId: task.id,
        taskTitle: task.title,
        oldStatus,
        newStatus,
      }),
    ),
  );
}
