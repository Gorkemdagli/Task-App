import type { TaskComment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { assertCanCommentOnTask, type Actor } from '../lib/permissions';
import { notifyTaskCommented } from '../lib/notifications';
import type { CreateCommentInput } from '../schemas/comments.schema';

export interface CommentWithAuthor {
  id: string;
  taskId: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    displayId: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

const COMMENT_INCLUDE = {
  author: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
} as const;

function toComment(
  c: TaskComment & {
    author: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
  },
): CommentWithAuthor {
  return {
    id: c.id,
    taskId: c.taskId,
    body: c.body,
    createdAt: c.createdAt,
    author: c.author,
  };
}

/** Yorum ekler. Bildirim: assigner + assignee + önceki yorum yazarlarına. */
export async function createComment(
  taskId: string,
  input: CreateCommentInput,
  actor: Actor,
): Promise<CommentWithAuthor> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      teamId: true,
      assignerId: true,
      assigneeId: true,
      team: { select: { tenantId: true } },
    },
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');

  await assertCanCommentOnTask(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeId: task.assigneeId,
    team: { tenantId: task.team.tenantId },
  });

  const comment = await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorId: actor.id,
      body: input.body,
    },
    include: COMMENT_INCLUDE,
  });

  // Bildirimleri gönder (async, hata olursa logla ama yorumu geri alma)
  try {
    await notifyTaskCommented(
      {
        id: task.id,
        title: task.title,
        assignerId: task.assignerId,
        assigneeId: task.assigneeId,
      },
      actor.id,
    );
  } catch (err) {
    console.error('Bildirim gönderilemedi:', err);
  }

  return toComment(comment);
}

/** Yorumları listeler. Eski → yeni sıralı. */
export async function listComments(taskId: string, actor: Actor): Promise<CommentWithAuthor[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      teamId: true,
      assignerId: true,
      assigneeId: true,
      team: { select: { tenantId: true } },
    },
  });
  if (!task) throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');

  await assertCanCommentOnTask(actor, {
    id: task.id,
    teamId: task.teamId,
    assignerId: task.assignerId,
    assigneeId: task.assigneeId,
    team: { tenantId: task.team.tenantId },
  });

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: COMMENT_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  return comments.map(toComment);
}
