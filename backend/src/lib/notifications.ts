import type { NotificationType, TaskStatus } from '@prisma/client';
import type { TenantDb } from '../db/types';

async function allowsNotification(
  db: TenantDb,
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  switch (type) {
    case 'task_assigned': {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { notifyTaskAssigned: true },
      });
      return user?.notifyTaskAssigned ?? false;
    }
    case 'task_commented': {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { notifyTaskCommented: true },
      });
      return user?.notifyTaskCommented ?? false;
    }
    case 'message_received': {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { notifyMessageReceived: true },
      });
      return user?.notifyMessageReceived ?? false;
    }
    default:
      return true;
  }
}

/**
 * Tek bir kullanıcıya notification kaydı ekler. Gösterim UI'ı faz 6'da gelecek.
 * Çağıran, hedef user'ın tenant'ından olduğunu doğrulamalı (kendi route'ında).
 */
export async function notifyUser(
  db: TenantDb,
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!(await allowsNotification(db, userId, type))) return;
  await db.notification.create({
    data: {
      userId,
      type,
      payload: payload as object,
    },
  });
}

/** Task atandığında assignee'e bildirim. (Yeni oluşturma veya assignee değişiminde çağrılır.) */
export async function notifyTaskAssigned(
  db: TenantDb,
  assigneeId: string,
  taskId: string,
  taskTitle: string,
): Promise<void> {
  if (!assigneeId) return;
  await notifyUser(db, assigneeId, 'task_assigned', { taskId, taskTitle });
}

/**
 * Yorum eklendiğinde: assigner + tüm assignees + önceki yorum yazarlarına bildirim.
 * Yorumu yazan kişi kendisine bildirim almaz.
 */
export async function notifyTaskCommented(
  db: TenantDb,
  task: { id: string; title: string; assignerId: string; assigneeIds: string[] },
  commentAuthorId: string,
): Promise<void> {
  const recipientIds = new Set<string>();
  if (task.assignerId !== commentAuthorId) recipientIds.add(task.assignerId);
  for (const uid of task.assigneeIds) {
    if (uid !== commentAuthorId) recipientIds.add(uid);
  }

  const priorCommenters = await db.taskComment.findMany({
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
      notifyUser(db, userId, 'task_commented', { taskId: task.id, taskTitle: task.title }),
    ),
  );
}

/**
 * Multi-assignee status teklifinde ack bekleyen assignees'e bildirim.
 * Teklif eden kişi (proposer) kendine bildirim almaz.
 */
export async function notifyTaskStatusPending(
  db: TenantDb,
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
      notifyUser(db, userId, 'task_status_pending', {
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
  db: TenantDb,
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
      notifyUser(db, userId, 'task_status_changed', {
        taskId: task.id,
        taskTitle: task.title,
        oldStatus,
        newStatus,
      }),
    ),
  );
}
