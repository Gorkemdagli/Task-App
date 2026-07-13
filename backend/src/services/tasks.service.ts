import type { Task, TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  assertCanCreateTask,
  assertCanDeleteTask,
  assertCanUpdateTaskFields,
  assertCanUpdateTaskPriority,
  assertCanUpdateTaskStatus,
  assertCanViewTask,
  type Actor,
  loadTeamForActor,
} from '../lib/permissions';
import { notifyTaskAssigned } from '../lib/notifications';
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
  assigneeId: string;
  createdAt: Date;
  updatedAt: Date;
  team: { id: string; name: string; tenantId: string };
  assigner: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
  assignee: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
}

const TASK_INCLUDE = {
  team: { select: { id: true, name: true, tenantId: true } },
  assigner: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
  assignee: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
} as const;

/** Görev oluşturur. Atanan kişi aynı takımın üyesi olmalı. */
export async function createTask(input: CreateTaskInput, actor: Actor): Promise<TaskWithRelations> {
  const team = await loadTeamForActor(input.teamId, actor);
  await assertCanCreateTask(actor, team.id);

  // Assignee, bu takımın üyesi olmalı (cross-tenant atama engellenir)
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: input.assigneeId } },
    select: { userId: true },
  });
  if (!membership) {
    throw new AppError(400, 'Atanan kişi bu takımın üyesi olmalı', 'INVALID_ASSIGNEE');
  }

  const task = await prisma.task.create({
    data: {
      teamId: team.id,
      title: input.title,
      description: input.description ?? null,
      deadline: input.deadline ?? null,
      priority: input.priority,
      assigneeId: input.assigneeId,
      assignerId: actor.id,
    },
    include: TASK_INCLUDE,
  });

  // Bildirim: assignee kendisi değilse
  if (task.assigneeId !== actor.id) {
    await notifyTaskAssigned(task.assigneeId, task.id, task.title);
  }

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
    ...(query.assigneeId && { assigneeId: query.assigneeId }),
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
    assigneeId: task.assigneeId,
    team: { tenantId: task.team.tenantId },
  });
  return task as TaskWithRelations;
}

async function loadTaskOrThrow(taskId: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  return task;
}

export async function updateTaskStatus(
  taskId: string,
  input: UpdateTaskStatusInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskOrThrow(taskId);
  await assertCanUpdateTaskStatus(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeId: task.assigneeId,
  });

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { status: input.status },
    include: TASK_INCLUDE,
  });
  return updated as TaskWithRelations;
}

export async function updateTaskPriority(
  taskId: string,
  input: UpdateTaskPriorityInput,
  actor: Actor,
): Promise<TaskWithRelations> {
  const task = await loadTaskOrThrow(taskId);
  await assertCanUpdateTaskPriority(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeId: task.assigneeId,
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
  const task = await loadTaskOrThrow(taskId);
  await assertCanUpdateTaskFields(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeId: task.assigneeId,
  });

  // Assignee değişiyorsa yeni assignee takımın üyesi olmalı
  if (input.assigneeId && input.assigneeId !== task.assigneeId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: task.teamId, userId: input.assigneeId } },
      select: { userId: true },
    });
    if (!membership) {
      throw new AppError(400, 'Atanan kişi bu takımın üyesi olmalı', 'INVALID_ASSIGNEE');
    }
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.deadline !== undefined && { deadline: input.deadline }),
      ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
    },
    include: TASK_INCLUDE,
  });

  // Assignee değiştiyse yeni assignee'ye bildirim
  if (input.assigneeId && input.assigneeId !== task.assigneeId && input.assigneeId !== actor.id) {
    await notifyTaskAssigned(input.assigneeId, updated.id, updated.title);
  }

  return updated as TaskWithRelations;
}

export async function deleteTask(taskId: string, actor: Actor): Promise<void> {
  const task = await loadTaskOrThrow(taskId);
  await assertCanDeleteTask(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeId: task.assigneeId,
  });
  await prisma.task.delete({ where: { id: taskId } });
}
