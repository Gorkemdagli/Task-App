import { randomUUID } from 'node:crypto';
import type { TaskStatus } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { appendTaskEvent } from './task-events.service';
import {
  assertCanViewTask,
  isTeamAdminOf,
  requireTenant,
  type Actor,
} from '../lib/permissions';
import { AppError } from '../lib/appError';
import { createTaskFileStorage, type TaskFileStorage } from '../lib/taskFileStorage';
import { logger } from '../lib/logger';

export type TaskFileUpload = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  data: Buffer;
};

export type TaskFileItem = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploader: { id: string; name: string };
  canDelete: boolean;
};

type TaskPermissionRow = {
  id: string;
  teamId: string;
  assignerId: string;
  pendingStatus: TaskStatus | null;
  pendingProposedBy: string | null;
  team: { tenantId: string };
  assignees: Array<{ userId: string }>;
};

async function loadViewableTask(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<TaskPermissionRow> {
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
  return task;
}

function objectPath(tenantId: string, taskId: string, fileId: string): string {
  return `tenants/${tenantId}/tasks/${taskId}/files/${fileId}`;
}

function toTaskFileItem(
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
    uploader: { id: string; fullName: string };
  },
  actor: Actor,
  canManageTeam: boolean,
): TaskFileItem {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    uploader: { id: file.uploader.id, name: file.uploader.fullName },
    canDelete: file.uploader.id === actor.id || canManageTeam,
  };
}

export async function listTaskFiles(
  db: TenantDb,
  taskId: string,
  actor: Actor,
): Promise<TaskFileItem[]> {
  const task = await loadViewableTask(db, taskId, actor);
  const [files, canManageTeam] = await Promise.all([
    db.taskFile.findMany({
      where: { tenantId: task.team.tenantId, taskId: task.id, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploader: { select: { id: true, fullName: true } },
      },
    }),
    isTeamAdminOf(db, actor, task.teamId),
  ]);
  return files.map((file) => toTaskFileItem(file, actor, canManageTeam));
}

export async function createTaskFileRecord(
  db: TenantDb,
  taskId: string,
  file: TaskFileUpload,
  actor: Actor,
  storage: TaskFileStorage = createTaskFileStorage(),
): Promise<TaskFileItem> {
  const task = await loadViewableTask(db, taskId, actor);
  const tenantId = requireTenant(actor);
  const fileId = randomUUID();
  const path = objectPath(tenantId, task.id, fileId);

  await storage.upload(path, file.data, file.mimeType);
  try {
    const created = await db.taskFile.create({
      data: {
        id: fileId,
        tenantId,
        taskId: task.id,
        uploaderId: actor.id,
        originalName: file.originalName,
        objectPath: path,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploader: { select: { id: true, fullName: true } },
      },
    });
    await appendTaskEvent(db, {
      taskId: task.id,
      actorId: actor.id,
      eventType: 'file_added',
      metadata: {
        fileId: created.id,
        originalName: created.originalName,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
      },
    });
    return toTaskFileItem(created, actor, false);
  } catch (error) {
    try {
      await storage.remove(path);
    } catch (cleanupError) {
      logger.warn(
        { error: cleanupError instanceof Error ? cleanupError.message : 'unknown' },
        'task file upload cleanup failed',
      );
    }
    throw error;
  }
}

export async function createTaskFileDownload(
  db: TenantDb,
  taskId: string,
  fileId: string,
  actor: Actor,
): Promise<string> {
  const task = await loadViewableTask(db, taskId, actor);
  const files = await db.$queryRaw<Array<{ objectPath: string }>>`
    SELECT object_path AS "objectPath"
    FROM task_files
    WHERE id = ${fileId}
      AND tenant_id = ${task.team.tenantId}::uuid
      AND task_id = ${task.id}::uuid
      AND deleted_at IS NULL
    FOR UPDATE
  `;
  const file = files[0];
  if (!file) throw new AppError(404, 'Dosya bulunamadı', 'NOT_FOUND');
  return file.objectPath;
}

export async function markTaskFileDeleted(
  db: TenantDb,
  taskId: string,
  fileId: string,
  actor: Actor,
): Promise<string> {
  const task = await loadViewableTask(db, taskId, actor);
  const file = await db.taskFile.findFirst({
    where: { id: fileId, tenantId: task.team.tenantId, taskId: task.id },
    select: { id: true, uploaderId: true, objectPath: true, originalName: true, deletedAt: true },
  });
  if (!file) throw new AppError(404, 'Dosya bulunamadı', 'NOT_FOUND');

  if (file.uploaderId !== actor.id && !(await isTeamAdminOf(db, actor, task.teamId))) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }

  if (!file.deletedAt) {
    const deleted = await db.taskFile.updateMany({
      where: { id: file.id, tenantId: task.team.tenantId, taskId: task.id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });
    if (deleted.count === 1) {
      await appendTaskEvent(db, {
        taskId: task.id,
        actorId: actor.id,
        eventType: 'file_deleted',
        metadata: { fileId: file.id, originalName: file.originalName },
      });
    }
  }

  return file.objectPath;
}
