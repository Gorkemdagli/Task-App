import pino from 'pino';
import { env } from '../env';
import { prisma } from '../lib/prisma';

const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export type NotificationDTO = {
  id: string;
  userId: string;
  type: 'task_assigned' | 'task_commented' | 'message_received';
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
};

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const sep = decoded.lastIndexOf(':');
    if (sep < 0) return null;
    const createdAt = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}:${id}`, 'utf8').toString('base64');
}

export async function listNotifications(
  userId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ items: NotificationDTO[]; unreadCount: number; nextCursor: string | null }> {
  const where: {
    userId: string;
    OR?: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
  } = { userId };

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      where.OR = [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }];
    }
    // Malformed cursor → fall through (first page, no OR clause).
  }

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const hasMore = rows.length > opts.limit;
  const sliced = hasMore ? rows.slice(0, opts.limit) : rows;
  const items: NotificationDTO[] = sliced.map((n) => ({
    id: n.id,
    userId: n.userId,
    type: n.type,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));

  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, unreadCount, nextCursor };
}

export async function markAllRead(userId: string): Promise<number> {
  const start = Date.now();
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  logger.info(
    { userId, updatedCount: result.count, durationMs: Date.now() - start },
    'notifications.markAllRead',
  );
  return result.count;
}
