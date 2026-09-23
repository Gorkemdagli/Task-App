import type { NotificationType, TaskStatus } from '@prisma/client';
import type { TenantDb } from '../db/types';

export const COMPANY_ADMIN_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'task_status_changed',
  'company_invite_accepted',
  'company_invite_rejected',
];

export const COMPANY_INVITATION_OUTCOME_TYPES: readonly NotificationType[] = [
  'company_invite_accepted',
  'company_invite_rejected',
];

async function allowsNotification(
  db: TenantDb,
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tenantId: true,
      notifyTaskAssigned: true,
      notifyTaskCommented: true,
      notifyMessageReceived: true,
    },
  });
  if (!user || (user.role === 'companyAdmin' && user.tenantId === null)) return false;
  if (
    (user.role === 'companyAdmin' && !COMPANY_ADMIN_NOTIFICATION_TYPES.includes(type)) ||
    (user.role !== 'companyAdmin' && COMPANY_INVITATION_OUTCOME_TYPES.includes(type))
  ) {
    return false;
  }

  switch (type) {
    case 'task_assigned':
      return user.notifyTaskAssigned;
    case 'task_commented':
      return user.notifyTaskCommented;
    case 'message_received':
      return user.notifyMessageReceived;
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
  actorName?: string,
): Promise<void> {
  if (!assigneeId) return;
  await notifyUser(db, assigneeId, 'task_assigned', {
    taskId,
    taskTitle,
    ...(actorName ? { actorName } : {}),
  });
}

/**
 * Yorum eklendiğinde: assigner + tüm assignees + önceki yorum yazarlarına bildirim.
 * Yorumu yazan kişi kendisine bildirim almaz.
 */
export async function notifyTaskCommented(
  db: TenantDb,
  task: { id: string; title: string; assignerId: string; assigneeIds: string[] },
  commentAuthorId: string,
  commentAuthorName: string,
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
      notifyUser(db, userId, 'task_commented', {
        taskId: task.id,
        taskTitle: task.title,
        actorName: commentAuthorName,
      }),
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
        actorName: proposedByName,
      }),
    ),
  );
}

/**
 * Status değişikliği assignees ve task team adminlerine bildirim (actor hariç).
 */
export async function notifyTaskStatusChanged(
  db: TenantDb,
  recipientIds: string[],
  task: { id: string; title: string; teamId: string; team: { tenantId: string } },
  oldStatus: TaskStatus,
  newStatus: TaskStatus,
  actorId: string,
): Promise<void> {
  const teamAdmins = await db.teamMember.findMany({
    where: {
      teamId: task.teamId,
      role: 'teamAdmin',
      team: { tenantId: task.team.tenantId },
    },
    select: { userId: true },
  });
  const targets = new Set<string>();
  for (const uid of recipientIds) {
    if (uid !== actorId) targets.add(uid);
  }
  for (const admin of teamAdmins) {
    if (admin.userId !== actorId) targets.add(admin.userId);
  }
  if (targets.size === 0) return;

  const actor = await db.user.findFirst({
    where: { id: actorId, tenantId: task.team.tenantId },
    select: { fullName: true },
  });
  await Promise.all(
    Array.from(targets).map((userId) =>
      notifyUser(db, userId, 'task_status_changed', {
        taskId: task.id,
        taskTitle: task.title,
        oldStatus,
        newStatus,
        ...(actor ? { actorName: actor.fullName } : {}),
      }),
    ),
  );
}

export async function notifyCompanyInvitationOutcome(
  db: TenantDb,
  invitation: { id: string; tenantId: string; companyName: string },
  status: 'accepted' | 'rejected',
  actorName: string,
): Promise<void> {
  // Tenant is taken from the recipient invitation already verified by the caller.
  await db.$executeRaw`SELECT set_config('app.tenant_id', ${invitation.tenantId}, true)`;
  const admins = await db.user.findMany({
    where: { tenantId: invitation.tenantId, role: 'companyAdmin' },
    select: { id: true },
  });
  const type: NotificationType =
    status === 'accepted' ? 'company_invite_accepted' : 'company_invite_rejected';
  await Promise.all(
    admins.map(({ id }) =>
      notifyUser(db, id, type, {
        invitationId: invitation.id,
        companyName: invitation.companyName,
        actorName,
      }),
    ),
  );
}
