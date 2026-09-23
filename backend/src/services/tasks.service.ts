import type { TaskStatus, TaskPriority } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { AppError } from '../lib/appError';
import {
  assertCanAckTaskStatus,
  assertCanAssignTask,
  assertCanCancelTaskStatus,
  assertCanCreateTask,
  assertCanDeleteTask,
  assertCanRestoreTask,
  assertCanProposeTaskStatus,
  assertCanUpdateTaskFields,
  assertCanUpdateTaskPriority,
  assertCanUpdateTaskStatus,
  assertCanViewTask,
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
  UpdateTaskBlockedInput,
  UpdateTaskStatusInput,
  AckTaskStatusInput,
  RestoreTaskInput,
} from '../schemas/tasks.schema';
import { startOfUtcToday } from '../lib/calendarDate';
import { appendTaskEvent } from './task-events.service';

export interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  scopeItems: string[];
  targetAudience: string | null;
  expectedOutput: string | null;
  tags: string[];
  status: TaskStatus;
  priority: TaskPriority;
  isBlocked: boolean;
  blockedSince: Date | null;
  blockedReason: string | null;
  deadline: Date | null;
  estimateMinutes: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  teamId: string;
  assignerId: string;
  createdAt: Date;
  updatedAt: Date;
  pendingStatus: TaskStatus | null;
  pendingVersion: number;
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
    pendingVersion: number;
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
    select: { id: true, userId: true, proposedStatus: true, pendingVersion: true, ackedAt: true },
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
      scopeItems: input.scopeItems ?? [],
      expectedOutput: input.expectedOutput ?? null,
      deadline: input.deadline ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      priority: input.priority,
      assignerId: actor.id,
      assignees: { create: uniqueIds.map((userId) => ({ userId })) },
    },
    include: TASK_INCLUDE,
  });
  await appendTaskEvent(db, {
    taskId: task.id,
    actorId: actor.id,
    eventType: 'task_created',
  });

  // Bildirim: tüm assignee'lere (actor hariç)
  const recipientIds = new Set(uniqueIds);
  recipientIds.delete(actor.id);
  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      notifyTaskAssigned(db, userId, task.id, task.title, task.assigner.fullName),
    ),
  );

  return task as TaskWithRelations;
}

/** Filtreli liste. Üye: yalnız üyesi olduğu takımlar. Şirket Admini: tüm tenant. */
export async function listTasks(
  db: TenantDb,
  query: ListTasksQuery,
  actor: Actor,
): Promise<{ tasks: TaskWithRelations[]; total: number }> {
  const tenantId = actor.tenantId;
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
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: Date | null;
  archivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  teamId: string;
  assignerId: string;
  assigneeIds: Set<string>;
  pendingStatus: TaskStatus | null;
  pendingVersion: number;
  pendingProposedBy: string | null;
  statusAcks: Array<{ userId: string; pendingVersion: number }>;
  isBlocked: boolean;
  blockedSince: Date | null;
  blockedReason: string | null;
  tenantId: string;
}> {
  const task = await db.task.findFirst({
    where: { id: taskId, team: { tenantId: requireTenant(actor) } },
    include: {
      team: { select: { tenantId: true } },
      assignees: { select: { userId: true } },
      statusAcks: { select: { userId: true, pendingVersion: true } },
    },
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    archivedAt: task.archivedAt,
    isBlocked: task.isBlocked,
    blockedSince: task.blockedSince,
    blockedReason: task.blockedReason,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeIds: new Set(task.assignees.map((a) => a.userId)),
    pendingStatus: task.pendingStatus,
    pendingVersion: task.pendingVersion,
    pendingProposedBy: task.pendingProposedBy,
    statusAcks: task.statusAcks,
    tenantId: task.team.tenantId,
  };
}

async function lockTask(db: TenantDb, taskId: string, actor: Actor) {
  const tenantId = requireTenant(actor);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT task.id
    FROM tasks task
    JOIN teams team ON team.id = task.team_id
    WHERE task.id = ${taskId}::uuid
      AND team.tenant_id = ${tenantId}::uuid
    FOR UPDATE OF task
  `;
  if (rows.length === 0) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  return loadTaskWithAssignees(db, taskId, actor);
}

async function applyStatusLocked(
  db: TenantDb,
  task: Awaited<ReturnType<typeof loadTaskWithAssignees>>,
  status: TaskStatus,
  actorId: string,
): Promise<TaskWithRelations> {
  const transitionAt = new Date();
  const lifecycleData =
    task.status === status
      ? {}
      : {
          ...(task.status === 'todo' &&
          (status === 'in_progress' || status === 'done') &&
          task.startedAt === null
            ? { startedAt: transitionAt }
            : {}),
          ...(status === 'done'
            ? { completedAt: transitionAt }
            : task.status === 'done'
              ? { completedAt: null }
              : {}),
        };
  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      status,
      pendingStatus: null,
      pendingProposedBy: null,
      pendingProposedAt: null,
      ...lifecycleData,
    },
    include: TASK_INCLUDE,
  });
  await db.taskStatusAck.deleteMany({ where: { taskId: task.id } });

  if (task.status !== status) {
    await appendTaskEvent(db, {
      taskId: task.id,
      actorId,
      eventType: task.status === 'done' ? 'task_reopened' : 'status_changed',
      fromStatus: task.status,
      toStatus: status,
    });
    await notifyTaskStatusChanged(
      db,
      updated.assignees.map((assignee) => assignee.userId),
      updated,
      task.status,
      status,
      actorId,
    );
  }
  return updated as TaskWithRelations;
}

async function proposeStatusLocked(
  db: TenantDb,
  task: Awaited<ReturnType<typeof loadTaskWithAssignees>>,
  status: TaskStatus,
  actor: Actor,
): Promise<TaskWithRelations> {
  await assertCanProposeTaskStatus(db, actor, taskPermissionInput(task));
  if (task.assigneeIds.size === 1) return applyStatusLocked(db, task, status, actor.id);

  const pendingVersion = task.pendingVersion + 1;
  if (task.pendingStatus !== null) {
    await appendTaskEvent(db, {
      taskId: task.id,
      actorId: actor.id,
      eventType: 'status_change_rejected',
      fromStatus: task.status,
      toStatus: task.pendingStatus,
      metadata: { pendingVersion: task.pendingVersion },
    });
  }
  await db.taskStatusAck.deleteMany({ where: { taskId: task.id } });
  if (task.assigneeIds.has(actor.id)) {
    await db.taskStatusAck.create({
      data: {
        taskId: task.id,
        userId: actor.id,
        proposedStatus: status,
        pendingVersion,
      },
    });
  }

  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      pendingStatus: status,
      pendingProposedBy: actor.id,
      pendingProposedAt: new Date(),
      pendingVersion,
    },
    include: TASK_INCLUDE,
  });

  await appendTaskEvent(db, {
    taskId: task.id,
    actorId: actor.id,
    eventType: 'status_change_requested',
    fromStatus: task.status,
    toStatus: status,
  });

  await notifyTaskStatusPending(
    db,
    Array.from(task.assigneeIds),
    updated,
    status,
    actor.id,
    updated.pendingProposer?.fullName ?? 'Birisi',
  );
  return updated as TaskWithRelations;
}

async function transitionStatusLocked(
  db: TenantDb,
  task: Awaited<ReturnType<typeof loadTaskWithAssignees>>,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  await assertCanUpdateTaskStatus(db, actor, taskPermissionInput(task));
  if (task.assigneeIds.size === 1) return applyStatusLocked(db, task, input.status, actor.id);
  return proposeStatusLocked(db, task, input.status, actor);
}

export async function updateTaskStatus(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);
  return transitionStatusLocked(db, task, input, actor);
}

export async function proposeTaskStatus(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);
  return proposeStatusLocked(db, task, input.status, actor);
}

export async function ackTaskStatus(
  db: TenantDb,
  taskId: string,
  inputOrActor: AckTaskStatusInput | Actor,
  actorArg?: Actor,
): Promise<{ task: TaskWithRelations; applied: boolean }> {
  const actor = actorArg ?? (inputOrActor as Actor);
  const input = actorArg ? (inputOrActor as AckTaskStatusInput) : undefined;
  const task = await lockTask(db, taskId, actor);
  if (task.pendingStatus === null) {
    throw new AppError(400, 'Bekleyen status teklifi yok', 'NO_PENDING');
  }
  const pendingVersion = input?.pendingVersion ?? task.pendingVersion;
  if (pendingVersion !== task.pendingVersion) {
    throw new AppError(409, 'Teklif sürümü güncel değil', 'STALE_PENDING_VERSION');
  }

  await assertCanAckTaskStatus(db, actor, taskPermissionInput(task));

  const pendingStatus = task.pendingStatus;

  await db.taskStatusAck.upsert({
    where: {
      taskId_userId_pendingVersion: {
        taskId,
        userId: actor.id,
        pendingVersion,
      },
    },
    create: {
      taskId,
      userId: actor.id,
      proposedStatus: pendingStatus,
      pendingVersion,
    },
    update: { ackedAt: new Date(), proposedStatus: pendingStatus },
  });

  const currentAcks = await db.taskStatusAck.findMany({
    where: { taskId, pendingVersion: task.pendingVersion },
    select: { userId: true },
  });
  const ackedIds = new Set(currentAcks.map((ack) => ack.userId));
  const unanimous = Array.from(task.assigneeIds).every((id) => ackedIds.has(id));
  if (!unanimous) {
    const updated = await getTask(db, taskId, actor);
    return { task: updated, applied: false };
  }

  await appendTaskEvent(db, {
    taskId,
    actorId: actor.id,
    eventType: 'status_change_approved',
    fromStatus: task.status,
    toStatus: pendingStatus,
  });
  const updated = await applyStatusLocked(
    db,
    task,
    pendingStatus,
    task.pendingProposedBy ?? actor.id,
  );
  return { task: updated, applied: true };
}

export async function cancelTaskStatus(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);
  if (task.pendingStatus === null) {
    throw new AppError(400, 'Bekleyen status teklifi yok', 'NO_PENDING');
  }

  await assertCanCancelTaskStatus(db, actor, taskPermissionInput(task));

  await db.task.update({
    where: { id: taskId },
    data: { pendingStatus: null, pendingProposedBy: null, pendingProposedAt: null },
  });
  await db.taskStatusAck.deleteMany({ where: { taskId } });

  await appendTaskEvent(db, {
    taskId,
    actorId: actor.id,
    eventType: 'status_change_rejected',
    fromStatus: task.status,
    toStatus: task.pendingStatus,
  });

  return getTask(db, taskId, actor);
}

export async function updateTaskPriority(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskPriorityInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);
  await assertCanUpdateTaskPriority(db, actor, taskPermissionInput(task));

  const updated = await db.task.update({
    where: { id: taskId },
    data: { priority: input.priority },
    include: TASK_INCLUDE,
  });
  if (task.priority !== input.priority) {
    await appendTaskEvent(db, {
      taskId,
      actorId: actor.id,
      eventType: 'priority_changed',
      metadata: { oldPriority: task.priority, newPriority: input.priority },
    });
  }
  return updated as TaskWithRelations;
}

export async function updateTaskBlocked(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskBlockedInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);
  await assertCanUpdateTaskStatus(db, actor, taskPermissionInput(task));

  const reasonChanged = input.blockedReason !== undefined && input.blockedReason !== task.blockedReason;
  if (
    task.isBlocked === input.isBlocked &&
    !reasonChanged &&
    (input.isBlocked || (task.blockedSince === null && task.blockedReason === null))
  ) {
    return getTask(db, taskId, actor);
  }

  const nextBlocked = input.isBlocked;
  const updated = await db.task.update({
    where: { id: taskId },
    data: {
      isBlocked: nextBlocked,
      blockedSince: nextBlocked ? task.blockedSince ?? new Date() : null,
      blockedReason: nextBlocked
        ? input.blockedReason !== undefined
          ? input.blockedReason
          : task.blockedReason
        : null,
    },
    include: TASK_INCLUDE,
  });

  if (task.isBlocked !== nextBlocked) {
    await appendTaskEvent(db, {
      taskId,
      actorId: actor.id,
      eventType: nextBlocked ? 'task_blocked' : 'task_unblocked',
      metadata: nextBlocked ? { blockedReason: updated.blockedReason } : {},
    });
  }

  return updated as TaskWithRelations;
}

export async function updateTaskFields(
  db: TenantDb,
  taskId: string,
  input: UpdateTaskFieldsInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);
  const permissions = taskPermissionInput(task);
  if (input.assigneeIds !== undefined) await assertCanAssignTask(db, actor, permissions);
  if (Object.keys(input).some((field) => field !== 'assigneeIds')) {
    await assertCanUpdateTaskFields(db, actor, permissions);
  }

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
      ...(input.scopeItems !== undefined && { scopeItems: input.scopeItems }),
      ...(input.targetAudience !== undefined && { targetAudience: input.targetAudience }),
      ...(input.expectedOutput !== undefined && { expectedOutput: input.expectedOutput }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.deadline !== undefined && { deadline: input.deadline }),
      ...(input.estimateMinutes !== undefined && { estimateMinutes: input.estimateMinutes }),
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
  const affectedIds = [...addedAssigneeIds, ...removedAssigneeIds];
  if (affectedIds.length > 0) {
    const affectedUsers = await db.user.findMany({
      where: { id: { in: affectedIds }, tenantId: task.tenantId },
      select: { id: true, fullName: true },
    });
    const affectedNames = new Map(affectedUsers.map((user) => [user.id, user.fullName]));
    const metadata = (userIds: string[]) => ({
      affectedUserIds: userIds,
      affectedDisplayNames: userIds.map((userId) => affectedNames.get(userId) ?? 'Deleted user'),
    });
    if (addedAssigneeIds.length > 0) {
      await appendTaskEvent(db, {
        taskId,
        actorId: actor.id,
        eventType: 'assignee_added',
        metadata: metadata(addedAssigneeIds),
      });
    }
    if (removedAssigneeIds.length > 0) {
      await appendTaskEvent(db, {
        taskId,
        actorId: actor.id,
        eventType: 'assignee_removed',
        metadata: metadata(removedAssigneeIds),
      });
    }
  }
  if (
    input.deadline !== undefined &&
    (task.deadline?.getTime() ?? null) !== (input.deadline?.getTime() ?? null)
  ) {
    await appendTaskEvent(db, {
      taskId,
      actorId: actor.id,
      eventType: 'deadline_changed',
      metadata: {
        oldDeadline: task.deadline?.toISOString() ?? null,
        newDeadline: input.deadline?.toISOString() ?? null,
      },
    });
  }
  if (pendingCancelledByProposerRemoval) {
    await appendTaskEvent(db, {
      taskId,
      actorId: actor.id,
      eventType: 'status_change_rejected',
      fromStatus: task.status,
      toStatus: task.pendingStatus,
    });
  }
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
      where: {
        taskId,
        pendingVersion: task.pendingVersion,
        userId: { not: task.pendingProposedBy ?? '' },
      },
    });
    if (ackCount >= updated.assignees.length - 1) {
      const pendingActor: Actor = task.pendingProposedBy
        ? { id: task.pendingProposedBy, role: 'member', tenantId: task.tenantId }
        : actor;
      const lockedTask = await loadTaskWithAssignees(db, taskId, actor);
      await appendTaskEvent(db, {
        taskId,
        actorId: actor.id,
        eventType: 'status_change_approved',
        fromStatus: lockedTask.status,
        toStatus: task.pendingStatus,
      });
      await applyStatusLocked(db, lockedTask, task.pendingStatus, pendingActor.id);
      return getTask(db, taskId, actor);
    }
  }

  // Yalnız yeni eklenen assignee'lere bildirim (actor hariç)
  if (addedAssigneeIds.length > 0) {
    const recipients = new Set(addedAssigneeIds);
    recipients.delete(actor.id);
    if (task.pendingStatus !== null && !pendingCancelledByProposerRemoval) {
      await notifyTaskStatusPending(
        db,
        Array.from(recipients),
        updated,
        task.pendingStatus,
        task.pendingProposedBy ?? actor.id,
        updated.pendingProposer?.fullName ?? 'Birisi',
      );
    } else {
      const assigningActor = await db.user.findFirst({
        where: { id: actor.id, tenantId: task.tenantId },
        select: { fullName: true },
      });
      await Promise.all(
        Array.from(recipients).map((userId) =>
          notifyTaskAssigned(db, userId, updated.id, updated.title, assigningActor?.fullName),
        ),
      );
    }
  }

  return updated as TaskWithRelations;
}

export async function restoreTask(
  db: TenantDb,
  taskId: string,
  input: RestoreTaskInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await lockTask(db, taskId, actor);

  await assertCanRestoreTask(db, actor, task);
  if (task.archivedAt === null) {
    throw new AppError(400, 'Görev arşivlenmiş değil', 'TASK_NOT_ARCHIVED');
  }
  if (input.deadline < startOfUtcToday()) {
    throw new AppError(
      400,
      'Aktifleştirme tarihi bugün veya gelecek olmalı',
      'INVALID_RESTORE_DEADLINE',
    );
  }

  const updated = await db.task.update({
    where: { id: taskId },
    data: { deadline: input.deadline, archivedAt: null },
    include: TASK_INCLUDE,
  });
  if ((task.deadline?.getTime() ?? null) !== input.deadline.getTime()) {
    await appendTaskEvent(db, {
      taskId,
      actorId: actor.id,
      eventType: 'deadline_changed',
      metadata: {
        oldDeadline: task.deadline?.toISOString() ?? null,
        newDeadline: input.deadline.toISOString(),
      },
    });
  }
  return updated as TaskWithRelations;
}

export async function deleteTask(db: TenantDb, taskId: string, actor: Actor): Promise<void> {
  const task = await loadTaskWithAssignees(db, taskId, actor);
  await assertCanDeleteTask(db, actor, taskPermissionInput(task));
  await db.task.delete({ where: { id: taskId } });
}
