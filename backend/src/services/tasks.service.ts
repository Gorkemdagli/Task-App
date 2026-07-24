import type { TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  assertCanAckTaskStatus,
  assertCanCancelTaskStatus,
  assertCanCreateTask,
  assertCanDeleteTask,
  assertCanProposeTaskStatus,
  assertCanUpdateTaskFields,
  assertCanUpdateTaskPriority,
  assertCanUpdateTaskStatus,
  assertCanViewTask,
  isCompanyAdmin,
  isTeamAdminOf,
  type Actor,
  loadTeamForActor,
} from '../lib/permissions';
import {
  notifyTaskAssigned,
  notifyTaskStatusChanged,
  notifyTaskStatusPending,
} from '../lib/notifications';
import type {
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskFieldsInput,
  UpdateTaskPriorityInput,
  UpdateTaskStatusInput,
} from '../schemas/tasks.schema';

export interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: Date | null;
  archivedAt: Date | null;
  teamId: string;
  assignerId: string;
  createdAt: Date;
  updatedAt: Date;
  pendingStatus: TaskStatus | null;
  pendingProposedBy: string | null;
  pendingProposedAt: Date | null;
  pendingProposer: { id: string; displayId: string; fullName: string; avatarUrl: string | null } | null;
  statusAcks: Array<{
    id: string;
    userId: string;
    proposedStatus: TaskStatus;
    ackedAt: Date;
  }>;
  team: { id: string; name: string; tenantId: string };
  assigner: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
  assignees: Array<{
    userId: string;
    assignedAt: Date;
    user: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
  }>;
}

const TASK_INCLUDE = {
  team: { select: { id: true, name: true, tenantId: true } },
  assigner: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
  pendingProposer: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
  assignees: {
    include: {
      user: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
    },
    orderBy: { assignedAt: 'asc' as const },
  },
  statusAcks: {
    select: { id: true, userId: true, proposedStatus: true, ackedAt: true },
  },
} as const;

/** Görev oluşturur. Tüm atananlar aynı takımın üyesi olmalı. */
export async function createTask(input: CreateTaskInput, actor: Actor): Promise<TaskWithRelations> {
  const team = await loadTeamForActor(input.teamId, actor);
  await assertCanCreateTask(actor, team.id);

  // Tüm atananlar bu takımın üyesi olmalı (cross-tenant atama engellenir)
  const uniqueIds = Array.from(new Set(input.assigneeIds));
  const memberships = await prisma.teamMember.findMany({
    where: { teamId: team.id, userId: { in: uniqueIds } },
    select: { userId: true },
  });
  if (memberships.length !== uniqueIds.length) {
    throw new AppError(400, 'Atanan kişiler bu takımın üyesi olmalı', 'INVALID_ASSIGNEE');
  }

  const task = await prisma.task.create({
    data: {
      teamId: team.id,
      title: input.title,
      description: input.description ?? null,
      deadline: input.deadline ?? null,
      priority: input.priority,
      assignerId: actor.id,
      assignees: { create: uniqueIds.map((userId) => ({ userId })) },
    },
    include: TASK_INCLUDE,
  });

  // Bildirim: tüm assignee'lere (actor hariç)
  const recipientIds = new Set(uniqueIds);
  recipientIds.delete(actor.id);
  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      notifyTaskAssigned(userId, task.id, task.title),
    ),
  );

  return task as TaskWithRelations;
}

/** Filtreli liste. Üye: yalnız üyesi olduğu takımlar. Şirket Admini: tüm tenant. */
export async function listTasks(
  query: ListTasksQuery,
  actor: Actor,
): Promise<{ tasks: TaskWithRelations[]; total: number }> {
  const tenantId = (() => {
    if (actor.tenantId === null) return null;
    return actor.tenantId;
  })();
  if (tenantId === null) return { tasks: [], total: 0 };

  const isAdmin = actor.role === 'companyAdmin';

  const teamFilter = isAdmin ? { tenantId } : { tenantId, members: { some: { userId: actor.id } } };

  const where = {
    team: teamFilter,
    ...(query.status?.length && { status: { in: query.status } }),
    ...(query.priority?.length && { priority: { in: query.priority } }),
    ...(query.teamId && { teamId: query.teamId }),
    ...(query.assigneeIds?.length && {
      assignees: { some: { userId: { in: query.assigneeIds } } },
    }),
    ...(query.deadlineFrom || query.deadlineTo
      ? {
          deadline: {
            ...(query.deadlineFrom && { gte: query.deadlineFrom }),
            ...(query.deadlineTo && { lte: query.deadlineTo }),
          },
        }
      : {}),
    ...(query.includeArchived ? {} : { archivedAt: null }),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks: tasks as TaskWithRelations[], total };
}

/** Tek görev. Yetkisiz → 403/404. Cross-tenant → 404. */
export async function getTask(taskId: string, actor: Actor): Promise<TaskWithRelations> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  await assertCanViewTask(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: task.assignees.map((a) => ({ userId: a.userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
    team: { tenantId: task.team.tenantId },
  });
  return task as TaskWithRelations;
}

async function loadTaskWithAssignees(taskId: string): Promise<{
  id: string;
  teamId: string;
  assignerId: string;
  assigneeIds: Set<string>;
  pendingStatus: TaskStatus | null;
  pendingProposedBy: string | null;
  tenantId: string;
}> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignees: { select: { userId: true } },
      team: { select: { tenantId: true } },
    },
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  return {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeIds: new Set(task.assignees.map((a) => a.userId)),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
    tenantId: task.team.tenantId,
  };
}

export async function updateTaskStatus(
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(taskId);
  await assertCanUpdateTaskStatus(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });

  // Cross-tenant guard
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }

  // Multi-assignee + assignee (non-admin) → propose rotası
  const isAdmin = isCompanyAdmin(actor) || (await isTeamAdminOf(actor, task.teamId));
  if (!isAdmin && task.assigneeIds.size > 1 && task.assigneeIds.has(actor.id)) {
    return proposeTaskStatusInternal(taskId, input.status, actor, task);
  }

  // Admin veya tek-assignee → direct apply (pending varsa temizle)
  return applyStatusDirect(taskId, input.status, actor);
}

async function applyStatusDirect(
  taskId: string,
  status: TaskStatus,
  actor: Actor,
): Promise<TaskWithRelations> {
  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, title: true, assignees: { select: { userId: true } } },
  });
  if (!before) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.task.update({
      where: { id: taskId },
      data: {
        status,
        pendingStatus: null,
        pendingProposedBy: null,
        pendingProposedAt: null,
      },
      include: TASK_INCLUDE,
    });
    if (before.status !== status) {
      await tx.taskStatusAck.deleteMany({ where: { taskId } });
    }
    return u;
  });

  if (before.status !== status) {
    const recipientIds = updated.assignees.map((a) => a.userId);
    await notifyTaskStatusChanged(recipientIds, updated, before.status, status, actor.id);
  }

  return updated as TaskWithRelations;
}

async function proposeTaskStatusInternal(
  taskId: string,
  status: TaskStatus,
  actor: Actor,
  task: {
    id: string;
    teamId: string;
    assignerId: string;
    assigneeIds: Set<string>;
    pendingStatus: TaskStatus | null;
    pendingProposedBy: string | null;
    tenantId: string;
  },
): Promise<TaskWithRelations> {
  await assertCanProposeTaskStatus(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });

  // Tek-assignee ise atomik apply
  if (task.assigneeIds.size === 1) {
    return applyStatusDirect(taskId, status, actor);
  }

  // Pending'i sıfırla + ack rows temizle (her ack'te ayrı row oluşur)
  const recipientsForAck = Array.from(task.assigneeIds).filter((uid) => uid !== actor.id);
  // Proposer assignee ise implicit yes'i explicit ack row'a yaz: banner'da
  // "önerdi ve onayladı" + kalan ack sayısı doğru görünsün. ackTaskStatus
  // threshold mekanizması proposer'ı zaten count'tan dışlıyor.
  const proposerIsAssignee = task.assigneeIds.has(actor.id);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.taskStatusAck.deleteMany({ where: { taskId } });
    if (proposerIsAssignee) {
      await tx.taskStatusAck.create({
        data: { taskId, userId: actor.id, proposedStatus: status },
      });
    }
    return tx.task.update({
      where: { id: taskId },
      data: {
        pendingStatus: status,
        pendingProposedBy: actor.id,
        pendingProposedAt: new Date(),
      },
      include: TASK_INCLUDE,
    });
  });

  // Bildirim: ack bekleyen assignees'e
  await notifyTaskStatusPending(
    recipientsForAck,
    updated,
    status,
    actor.id,
    updated.pendingProposer?.fullName ?? 'Birisi',
  );

  return updated as TaskWithRelations;
}

export async function proposeTaskStatus(
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(taskId);
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }

  // Admin de dahil tüm propose'lar proposeTaskStatusInternal'a girer:
  // tek-assignee → atomik apply, multi-assignee → pending + ack bekleme.
  // Admin bypass kaldırıldı (2026-07-25 admin multi-assignee confirm PR).
  return proposeTaskStatusInternal(taskId, input.status, actor, task);
}

export async function ackTaskStatus(
  taskId: string,
  actor: Actor,
): Promise<{ task: TaskWithRelations; applied: boolean }> {
  const task = await loadTaskWithAssignees(taskId);
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }
  if (task.pendingStatus === null) {
    throw new AppError(400, 'Bekleyen status teklifi yok', 'NO_PENDING');
  }

  await assertCanAckTaskStatus(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });

  const pendingStatus = task.pendingStatus;

  // Upsert ack
  try {
    await prisma.taskStatusAck.upsert({
      where: { taskId_userId: { taskId, userId: actor.id } },
      create: { taskId, userId: actor.id, proposedStatus: pendingStatus },
      update: { ackedAt: new Date(), proposedStatus: pendingStatus },
    });
  } catch (e) {
    throw new AppError(409, 'Ack yarış durumu, tekrar deneyin', 'CONFLICT');
  }

  // Proposer implicit yes. Apply koşulu: non-proposer ack sayısı >= assignees.count - 1
  // Proposer kendi ack'ı threshold'u tek başına karşılamamalı (front-end'de modal gösterilse bile).
  const ackCount = await prisma.taskStatusAck.count({
    where: { taskId, userId: { not: task.pendingProposedBy ?? '' } },
  });
  if (ackCount < task.assigneeIds.size - 1) {
    const updated = await getTask(taskId, actor);
    return { task: updated, applied: false };
  }

  // Tüm ack tamam → apply
  const updated = await applyStatusDirect(taskId, pendingStatus, task.pendingProposedBy ? { id: task.pendingProposedBy, role: 'member', tenantId: task.tenantId } as Actor : actor);
  return { task: updated, applied: true };
}

export async function cancelTaskStatus(
  taskId: string,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(taskId);
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }
  if (task.pendingStatus === null) {
    throw new AppError(400, 'Bekleyen status teklifi yok', 'NO_PENDING');
  }

  await assertCanCancelTaskStatus(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        pendingStatus: null,
        pendingProposedBy: null,
        pendingProposedAt: null,
      },
    }),
    prisma.taskStatusAck.deleteMany({ where: { taskId } }),
  ]);

  return getTask(taskId, actor);
}

export async function updateTaskPriority(
  taskId: string,
  input: UpdateTaskPriorityInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(taskId);
  await assertCanUpdateTaskPriority(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { priority: input.priority },
    include: TASK_INCLUDE,
  });
  return updated as TaskWithRelations;
}

export async function updateTaskFields(
  taskId: string,
  input: UpdateTaskFieldsInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(taskId);
  await assertCanUpdateTaskFields(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });

  let nextAssigneeIds: string[] | undefined;
  let addedAssigneeIds: string[] = [];
  let removedAssigneeIds: string[] = [];

  if (input.assigneeIds !== undefined) {
    const uniqueIds = Array.from(new Set(input.assigneeIds));
    const memberships = await prisma.teamMember.findMany({
      where: { teamId: task.teamId, userId: { in: uniqueIds } },
      select: { userId: true },
    });
    if (memberships.length !== uniqueIds.length) {
      throw new AppError(400, 'Atanan kişiler bu takımın üyesi olmalı', 'INVALID_ASSIGNEE');
    }
    nextAssigneeIds = uniqueIds;
    const newSet = new Set(uniqueIds);
    addedAssigneeIds = uniqueIds.filter((id) => !task.assigneeIds.has(id));
    removedAssigneeIds = Array.from(task.assigneeIds).filter((id) => !newSet.has(id));
  }

  // Pending varsa ve proposer çıkarıldıysa → pending iptal
  const pendingCancelledByProposerRemoval =
    task.pendingStatus !== null &&
    task.pendingProposedBy !== null &&
    removedAssigneeIds.includes(task.pendingProposedBy);

  const updated = await prisma.$transaction(async (tx) => {
    if (pendingCancelledByProposerRemoval) {
      await tx.taskStatusAck.deleteMany({ where: { taskId } });
    }

    const u = await tx.task.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.deadline !== undefined && { deadline: input.deadline }),
        ...(pendingCancelledByProposerRemoval && {
          pendingStatus: null,
          pendingProposedBy: null,
          pendingProposedAt: null,
        }),
        ...(nextAssigneeIds !== undefined && {
          assignees: {
            deleteMany: {},
            create: nextAssigneeIds.map((userId) => ({ userId })),
          },
        }),
      },
      include: TASK_INCLUDE,
    });

    // Pending sonrası ack row sync (proposer çıkarılmadıysa)
    if (task.pendingStatus !== null && !pendingCancelledByProposerRemoval && nextAssigneeIds !== undefined) {
      // Çıkarılan assignee'lerin ack row'larını sil
      if (removedAssigneeIds.length > 0) {
        await tx.taskStatusAck.deleteMany({
          where: { taskId, userId: { in: removedAssigneeIds } },
        });
      }
      // Eklenen assignee'ler ack row oluşturmaz; ack ancak explicit POST /status/ack ile oluşur.
    }

    return u;
  });

  // Pending iptal edilmediyse ve assignee değiştiyse kalan ack tamam mı?
  if (
    task.pendingStatus !== null &&
    !pendingCancelledByProposerRemoval &&
    removedAssigneeIds.length > 0 &&
    nextAssigneeIds !== undefined
  ) {
    // Proposer implicit yes: ackCount (proposer hariç) >= assignees.count - 1
    const ackCount = await prisma.taskStatusAck.count({
      where: { taskId, userId: { not: task.pendingProposedBy ?? '' } },
    });
    if (ackCount >= updated.assignees.length - 1) {
      const newAssigneeIds = updated.assignees.map((a) => a.userId);
      const pendingActor: Actor = task.pendingProposedBy
        ? { id: task.pendingProposedBy, role: 'member', tenantId: task.tenantId }
        : actor;
      await applyStatusDirect(taskId, task.pendingStatus, pendingActor);
      await notifyTaskStatusChanged(
        newAssigneeIds,
        updated,
        updated.status,
        task.pendingStatus,
        pendingActor.id,
      );
      return getTask(taskId, actor);
    }
  }

  // Yalnız yeni eklenen assignee'lere bildirim (actor hariç)
  if (addedAssigneeIds.length > 0) {
    const recipients = new Set(addedAssigneeIds);
    recipients.delete(actor.id);
    await Promise.all(
      Array.from(recipients).map((userId) =>
        notifyTaskAssigned(userId, updated.id, updated.title),
      ),
    );
  }

  return updated as TaskWithRelations;
}

export async function deleteTask(taskId: string, actor: Actor): Promise<void> {
  const task = await loadTaskWithAssignees(taskId);
  await assertCanDeleteTask(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(task.assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  });
  await prisma.task.delete({ where: { id: taskId } });
}
