export type NotificationType =
  | 'task_assigned'
  | 'task_commented'
  | 'message_received'
  | 'task_status_pending'
  | 'task_status_changed';

export type TaskNotificationType = Exclude<NotificationType, 'message_received'>;

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface BaseNotificationPayload {
  actorId?: string;
  actorName?: string;
}

export interface TaskNotificationPayload extends BaseNotificationPayload {
  taskId: string;
  taskTitle: string;
  proposedStatus?: TaskStatus;
  proposedBy?: string;
  proposedByName?: string;
  oldStatus?: TaskStatus;
  newStatus?: TaskStatus;
}

export type MessageNotificationPayload = BaseNotificationPayload;

export type NotificationPayload = TaskNotificationPayload | MessageNotificationPayload;

export type NotificationLike =
  | { type: TaskNotificationType; payload: TaskNotificationPayload }
  | { type: 'message_received'; payload: MessageNotificationPayload };

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

export function notificationCopy(n: NotificationLike): string {
  switch (n.type) {
    case 'task_assigned': {
      const title = n.payload.taskTitle;
      const actor = (n.payload.actorName ?? '').trim();
      return actor
        ? `${actor} sana yeni bir görev atadı: ${title}`
        : `Yeni bir görev atandı: ${title}`;
    }
    case 'task_commented': {
      const actor = (n.payload.actorName ?? '').trim();
      return actor ? `${actor} göreve yorum ekledi` : 'Göreve yeni bir yorum eklendi';
    }
    case 'message_received': {
      const actor = (n.payload.actorName ?? '').trim();
      return actor ? `${actor} sana mesaj gönderdi` : 'Yeni mesaj';
    }
    case 'task_status_pending': {
      const title = n.payload.taskTitle;
      const proposer = (n.payload.proposedByName ?? '').trim();
      const status = n.payload.proposedStatus ? STATUS_LABEL[n.payload.proposedStatus] : '';
      return proposer
        ? `${proposer} "${title}" görevini "${status}" olarak değiştirmek istiyor. Onayın gerekiyor.`
        : `"${title}" görevi için status değişikliği teklif edildi.`;
    }
    case 'task_status_changed': {
      const title = n.payload.taskTitle;
      const newStatus = n.payload.newStatus ? STATUS_LABEL[n.payload.newStatus] : '';
      return `"${title}" görevinin durumu ${newStatus} olarak güncellendi`;
    }
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
