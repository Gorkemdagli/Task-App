import type { Prisma, TaskEvent, TaskEventType, TaskStatus } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { assertCanViewTask, type Actor, requireTenant } from '../lib/permissions';
import { AppError } from '../lib/appError';

export type TaskEventMetadata = Record<string, string | number | boolean | null | string[]>;

export type TaskHistoryItem = {
  id: string;
  taskId: string;
  actor: { id: string; name: string } | null;
  eventType: TaskEventType;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  metadata: TaskEventMetadata;
  createdAt: Date;
};

export async function appendTaskEvent(
  db: TenantDb,
  input: {
    taskId: string;
    actorId: string | null;
    eventType: TaskEventType;
    fromStatus?: TaskStatus | null;
    toStatus?: TaskStatus | null;
    metadata?: TaskEventMetadata;
  },
): Promise<TaskEvent> {
  return db.taskEvent.create({
    data: {
      taskId: input.taskId,
      actorId: input.actorId,
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const separator = decoded.lastIndexOf(':');
    if (separator < 0) return null;
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}:${id}`, 'utf8').toString('base64');
}

export async function listTaskHistory(
  db: TenantDb,
  taskId: string,
  actor: Actor,
  input: { cursor?: string; limit: number },
): Promise<{ items: TaskHistoryItem[]; nextCursor: string | null }> {
  const task = await db.task.findFirst({
    where: { id: taskId, team: { tenantId: requireTenant(actor) } },
    select: {
      id: true,
      teamId: true,
      assignerId: true,
      pendingStatus: true,
      pendingProposedBy: true,
      team: { select: { tenantId: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');

  await assertCanViewTask(db, actor, task);

  const limit = Number.isFinite(input.limit)
    ? Math.min(50, Math.max(1, Math.trunc(input.limit)))
    : 50;
  const where: Prisma.TaskEventWhereInput = { taskId };
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (cursor) {
    where.OR = [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ];
  }

  const rows = await db.taskEvent.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const actorIds = Array.from(
    new Set(sliced.flatMap((event) => (event.actorId ? [event.actorId] : []))),
  );
  const users = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds }, tenantId: task.team.tenantId },
        select: { id: true, fullName: true },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.fullName]));
  const items = sliced.map((event) => ({
    id: event.id,
    taskId: event.taskId,
    actor: event.actorId
      ? { id: event.actorId, name: names.get(event.actorId) ?? 'Deleted user' }
      : null,
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    metadata: event.metadata as TaskEventMetadata,
    createdAt: event.createdAt,
  }));
  const last = sliced[sliced.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
