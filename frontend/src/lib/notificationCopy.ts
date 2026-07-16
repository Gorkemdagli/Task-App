export type NotificationType = 'task_assigned' | 'task_commented' | 'message_received';

export interface NotificationPayload {
  taskId: string;
  taskTitle: string;
  actorId?: string;
  actorName?: string;
}

export interface NotificationLike {
  type: NotificationType;
  payload: NotificationPayload;
}

export function notificationCopy(n: NotificationLike): string {
  const actor = (n.payload.actorName ?? '').trim();
  const title = n.payload.taskTitle;

  switch (n.type) {
    case 'task_assigned':
      return actor
        ? `${actor} sana yeni bir görev atadı: ${title}`
        : `Yeni bir görev atandı: ${title}`;
    case 'task_commented':
      return actor ? `${actor} göreve yorum ekledi` : 'Göreve yeni bir yorum eklendi';
    case 'message_received':
      return actor ? `${actor} sana mesaj gönderdi` : 'Yeni mesaj';
  }
}

export function notificationActorInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
