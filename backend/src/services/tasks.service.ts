import type { TaskStatus, TaskPriority } from '@prisma/client';
import type { TenantDb } from '../db/types';
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
  requireTenant,
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
  pendingProposer: {
    id: string;
    displayId: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
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

function taskPermissionInput(task: {
  id: string;
  teamId: string;
  assignerId: string;
  pendingStatus: TaskStatus | null;
  pendingProposedBy: string | null;
  assigneeIds?: Set<string>;
  assignees?: Array<{ userId: string }>;
}) {
  const assigneeIds = task.assigneeIds ?? new Set((task.assignees ?? []).map((a) => a.userId));
  return {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assignees: Array.from(assigneeIds).map((userId) => ({ userId })),
    pendingStatus: task.pendingStatus,
    pendingProposedBy: task.pendingProposedBy,
  };
}

/** Görev oluşturur. Tüm atananlar aynı takımın üyesi olmalı. */
export async function createTask(
  db: TenantDb,
  input: CreateTaskInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const team = await loadTeamForActor(db, actor, input.teamId);
  await assertCanCreateTask(db, actor, team.id);

  // Tüm atananlar bu takımın üyesi olmalı (cross-tenant atama engellenir)
  const uniqueIds = Array.from(new Set(input.assigneeIds));
  const memberships = await db.teamMember.findMany({
    where: { teamId: team.id, userId: { in: uniqueIds } },
    select: { userId: true },
  });
  if (memberships.length !== uniqueIds.length) {
    throw new AppError(400, 'Atanan kişiler bu takımın üyesi olmalı', 'INVALID_ASSIGNEE');
  }

  const task = await db.task.create({
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
    Array.from(recipientIds).map((userId) => notifyTaskAssigned(db, userId, task.id, task.title)),
  );

  return task as TaskWithRelations;
}

/** Filtreli liste. Üye: yalnız üyesi olduğu takımlar. Şirket Admini: tüm tenant. */
export async function listTasks(
  db: TenantDb,
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
    db.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
      skip: query.offset,
    }),
    db.task.count({ where }),
  ]);

  return { tasks: tasks as TaskWithRelations[], total };
}

/** Tek görev. Yetkisiz → 403/404. Cross-tenant → 404. */
export async function getTask(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await db.task.findFirst({
    where: { id: taskId, team: { tenantId: requireTenant(actor) } },
    include: TASK_INCLUDE,
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  await assertCanViewTask(db, actor, {
    ...taskPermissionInput(task),
    team: { tenantId: task.team.tenantId },
  });
  return task as TaskWithRelations;
}

async function loadTaskWithAssignees(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<{
  id: string;
  teamId: string;
  assignerId: string;
  assigneeIds: Set<string>;
  pendingStatus: TaskStatus | null;
  pendingProposedBy: string | null;
  tenantId: string;
}> {
  const task = await db.task.findFirst({
    where: { id: taskId, team: { tenantId: requireTenant(actor) } },
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
  db: TenantDb,
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  await assertCanUpdateTaskStatus(db, actor, taskPermissionInput(task));

  // Cross-tenant guard
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }

  // Multi-assignee + assignee (non-admin) → propose rotası
  const isAdmin = isCompanyAdmin(actor) || (await isTeamAdminOf(db, actor, task.teamId));
  if (!isAdmin && task.assigneeIds.size > 1 && task.assigneeIds.has(actor.id)) {
    return proposeTaskStatusInternal(db, taskId, input.status, actor, task);
  }

  // Admin veya tek-assignee → direct apply (pending varsa temizle)
  return applyStatusDirect(db, taskId, input.status, actor);
}

async function applyStatusDirect(
  db: TenantDb,
  taskId: string,
  status: TaskStatus,
  actor: Actor,
): Promise<TaskWithRelations> {
  const before = await db.task.findFirst({
    where: { id: taskId },
    select: { status: true, title: true, assignees: { select: { userId: true } } },
  });
  if (!before) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');

  const updated = await db.task.update({
    where: { id: taskId },
    data: { status, pendingStatus: null, pendingProposedBy: null, pendingProposedAt: null },
    include: TASK_INCLUDE,
  });
  if (before.status !== status) await db.taskStatusAck.deleteMany({ where: { taskId } });

  if (before.status !== status) {
    const recipientIds = updated.assignees.map((a) => a.userId);
    await notifyTaskStatusChanged(db, recipientIds, updated, before.status, status, actor.id);
  }

  return updated as TaskWithRelations;
}

async function proposeTaskStatusInternal(
  db: TenantDb,
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
  await assertCanProposeTaskStatus(db, actor, taskPermissionInput(task));

  // Tek-assignee ise atomik apply
  if (task.assigneeIds.size === 1) {
    return applyStatusDirect(db, taskId, status, actor);
  }

  // Pending'i sıfırla + ack rows temizle (her ack'te ayrı row oluşur)
  const recipientsForAck = Array.from(task.assigneeIds).filter((uid) => uid !== actor.id);
  // Proposer assignee ise implicit yes'i explicit ack row'a yaz: banner'da
  // "önerdi ve onayladı" + kalan ack sayısı doğru görünsün. ackTaskStatus
  // threshold mekanizması proposer'ı zaten count'tan dışlıyor.
  const proposerIsAssignee = task.assigneeIds.has(actor.id);

  await db.taskStatusAck.deleteMany({ where: { taskId } });
  if (proposerIsAssignee) {
    await db.taskStatusAck.create({
      data: { taskId, userId: actor.id, proposedStatus: status },
    });
  }
  const updated = await db.task.update({
    where: { id: taskId },
    data: {
      pendingStatus: status,
      pendingProposedBy: actor.id,
      pendingProposedAt: new Date(),
    },
    include: TASK_INCLUDE,
  });

  // Bildirim: ack bekleyen assignees'e
  await notifyTaskStatusPending(
    db,
    recipientsForAck,
    updated,
    status,
    actor.id,
    updated.pendingProposer?.fullName ?? 'Birisi',
  );

  return updated as TaskWithRelations;
}

export async function proposeTaskStatus(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }

  // Admin de dahil tüm propose'lar proposeTaskStatusInternal'a girer:
  // tek-assignee → atomik apply, multi-assignee → pending + ack bekleme.
  // Admin bypass kaldırıldı (2026-07-25 admin multi-assignee confirm PR).
  return proposeTaskStatusInternal(db, taskId, input.status, actor, task);
}

export async function ackTaskStatus(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<{ task: TaskWithRelations; applied: boolean }> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }
  if (task.pendingStatus === null) {
    throw new AppError(400, 'Bekleyen status teklifi yok', 'NO_PENDING');
  }

  await assertCanAckTaskStatus(db, actor, taskPermissionInput(task));

  const pendingStatus = task.pendingStatus;

  // Upsert ack
  try {
    await db.taskStatusAck.upsert({
      where: { taskId_userId: { taskId, userId: actor.id } },
      create: { taskId, userId: actor.id, proposedStatus: pendingStatus },
      update: { ackedAt: new Date(), proposedStatus: pendingStatus },
    });
  } catch (e) {
    throw new AppError(409, 'Ack yarış durumu, tekrar deneyin', 'CONFLICT');
  }

  // Proposer implicit yes. Apply koşulu: non-proposer ack sayısı >= assignees.count - 1
  // Proposer kendi ack'ı threshold'u tek başına karşılamamalı (front-end'de modal gösterilse bile).
  const ackCount = await db.taskStatusAck.count({
    where: { taskId, userId: { not: task.pendingProposedBy ?? '' } },
  });
  if (ackCount < task.assigneeIds.size - 1) {
    const updated = await getTask(db, taskId, actor);
    return { task: updated, applied: false };
  }

  // Tüm ack tamam → apply
  const updated = await applyStatusDirect(
    db,
    taskId,
    pendingStatus,
    task.pendingProposedBy
      ? ({ id: task.pendingProposedBy, role: 'member', tenantId: task.tenantId } as Actor)
      : actor,
  );
  return { task: updated, applied: true };
}

export async function cancelTaskStatus(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  if (task.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }
  if (task.pendingStatus === null) {
    throw new AppError(400, 'Bekleyen status teklifi yok', 'NO_PENDING');
  }

  await assertCanCancelTaskStatus(db, actor, taskPermissionInput(task));

  await db.task.update({
    where: { id: taskId },
    data: {
      pendingStatus: null,
      pendingProposedBy: null,
      pendingProposedAt: null,
    },
  });
  await db.taskStatusAck.deleteMany({ where: { taskId } });

  return getTask(db, taskId, actor);
}

export async function updateTaskPriority(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskPriorityInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  await assertCanUpdateTaskPriority(db, actor, taskPermissionInput(task));

  const updated = await db.task.update({
    where: { id: taskId },
    data: { priority: input.priority },
    include: TASK_INCLUDE,
  });
  return updated as TaskWithRelations;
}

export async function updateTaskFields(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskFieldsInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  await assertCanUpdateTaskFields(db, actor, taskPermissionInput(task));

  let nextAssigneeIds: string[] | undefined;
  let addedAssigneeIds: string[] = [];
  let removedAssigneeIds: string[] = [];

  if (input.assigneeIds !== undefined) {
    const uniqueIds = Array.from(new Set(input.assigneeIds));
    const memberships = await db.teamMember.findMany({
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

  if (pendingCancelledByProposerRemoval) {
    await db.taskStatusAck.deleteMany({ where: { taskId } });
  }
  const updated = await db.task.update({
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
        assignees: { deleteMany: {}, create: nextAssigneeIds.map((userId) => ({ userId })) },
      }),
    },
    include: TASK_INCLUDE,
  });
  if (
    task.pendingStatus !== null &&
    !pendingCancelledByProposerRemoval &&
    nextAssigneeIds !== undefined &&
    removedAssigneeIds.length > 0
  ) {
    await db.taskStatusAck.deleteMany({ where: { taskId, userId: { in: removedAssigneeIds } } });
  }

  // Pending iptal edilmediyse ve assignee değiştiyse kalan ack tamam mı?
  if (
    task.pendingStatus !== null &&
    !pendingCancelledByProposerRemoval &&
    removedAssigneeIds.length > 0 &&
    nextAssigneeIds !== undefined
  ) {
    // Proposer implicit yes: ackCount (proposer hariç) >= assignees.count - 1
    const ackCount = await db.taskStatusAck.count({
      where: { taskId, userId: { not: task.pendingProposedBy ?? '' } },
    });
    if (ackCount >= updated.assignees.length - 1) {
      const newAssigneeIds = updated.assignees.map((a) => a.userId);
      const pendingActor: Actor = task.pendingProposedBy
        ? { id: task.pendingProposedBy, role: 'member', tenantId: task.tenantId }
        : actor;
      await applyStatusDirect(db, taskId, task.pendingStatus, pendingActor);
      await notifyTaskStatusChanged(
        db,
        newAssigneeIds,
        updated,
        updated.status,
        task.pendingStatus,
        pendingActor.id,
      );
      return getTask(db, taskId, actor);
    }
  }

  // Yalnız yeni eklenen assignee'lere bildirim (actor hariç)
  if (addedAssigneeIds.length > 0) {
    const recipients = new Set(addedAssigneeIds);
    recipients.delete(actor.id);
    await Promise.all(
      Array.from(recipients).map((userId) =>
        notifyTaskAssigned(db, userId, updated.id, updated.title),
      ),
    );
  }

  return updated as TaskWithRelations;
}

export async function deleteTask(db: TenantDb, taskId: string, actor: Actor): Promise<void> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  await assertCanDeleteTask(db, actor, taskPermissionInput(task));
  await db.task.delete({ where: { id: taskId } });
}
