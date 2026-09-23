import type { NotificationType, Prisma } from '@prisma/client';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { logger } from '../lib/logger';
import { AppError } from '../lib/appError';
import {
  COMPANY_ADMIN_NOTIFICATION_TYPES,
  COMPANY_INVITATION_OUTCOME_TYPES,
} from '../lib/notifications';

function visibleNotificationsWhere(actor: Actor): Prisma.NotificationWhereInput {
  return {
    userId: actor.id,
    type:
      actor.role === 'companyAdmin'
        ? { in: [...COMPANY_ADMIN_NOTIFICATION_TYPES] }
        : { notIn: [...COMPANY_INVITATION_OUTCOME_TYPES] },
  };
}

export type NotificationDTO = {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Prisma.JsonValue;
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

/** Kullanıcının bildirimlerini listeler. unreadCount tüm sayfaları kapsar (limit'ten bağımsız). */
export async function listNotifications(
  db: TenantDb,
  actor: Actor,
  opts: { limit: number; cursor?: string },
): Promise<{ items: NotificationDTO[]; unreadCount: number; nextCursor: string | null }> {
  const baseWhere = visibleNotificationsWhere(actor);
  const where: Prisma.NotificationWhereInput = { ...baseWhere };

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      where.OR = [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }];
    }
    // Malformed cursor → first page.
  }

  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
    }),
    db.notification.count({ where: { ...baseWhere, readAt: null } }),
  ]);

  const hasMore = rows.length > opts.limit;
  const sliced = hasMore ? rows.slice(0, opts.limit) : rows;
  const items: NotificationDTO[] = sliced.map((n) => ({
    id: n.id,
    userId: n.userId,
    type: n.type,
    payload: n.payload,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));

  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, unreadCount, nextCursor };
}

/** Tüm okunmamış bildirimleri okundu olarak işaretler. readAt IS NULL filtresi ile idempotent. */
export async function markAllRead(db: TenantDb, actor: Actor): Promise<number> {
  const start = Date.now();
  const result = await db.notification.updateMany({
    where: { ...visibleNotificationsWhere(actor), readAt: null },
    data: { readAt: new Date() },
  });
  logger.info(
    { updatedCount: result.count, durationMs: Date.now() - start },
    'notifications.markAllRead',
  );
  return result.count;
}

/** Tek bildirimi kullanÄ±cÄ± kapsamÄ±nda idempotent olarak okundu iÅŸaretler. */
export async function markNotificationRead(
  db: TenantDb,
  actor: Actor,
  notificationId: string,
): Promise<void> {
  const result = await db.notification.updateMany({
    where: { ...visibleNotificationsWhere(actor), id: notificationId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 1) return;

  const exists = await db.notification.count({
    where: { ...visibleNotificationsWhere(actor), id: notificationId },
  });
  if (exists === 0) {
    throw new AppError(404, 'Bildirim bulunamad\u0131', 'NOTIFICATION_NOT_FOUND');
  }
}
