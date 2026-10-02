import i18n from '@/i18n';

export type NotificationType =
  | 'task_assigned'
  | 'task_commented'
  | 'message_received'
  | 'task_status_pending'
  | 'task_status_changed'
  | 'company_invite_accepted'
  | 'company_invite_rejected';

export type CompanyInvitationNotificationType =
  | 'company_invite_accepted'
  | 'company_invite_rejected';
export type TaskNotificationType = Exclude<
  NotificationType,
  'message_received' | CompanyInvitationNotificationType
>;

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

export interface CompanyInvitationNotificationPayload extends BaseNotificationPayload {
  companyName: string;
}

export type NotificationPayload =
  | TaskNotificationPayload
  | MessageNotificationPayload
  | CompanyInvitationNotificationPayload;

export type NotificationLike =
  | { type: TaskNotificationType; payload: TaskNotificationPayload }
  | { type: 'message_received'; payload: MessageNotificationPayload }
  | {
      type: CompanyInvitationNotificationType;
      payload: CompanyInvitationNotificationPayload;
    };

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
      return i18n.t(actor ? 'notification.taskAssignedWithActor' : 'notification.taskAssigned', {
        actor,
        title,
      });
    }
    case 'task_commented': {
      const actor = (n.payload.actorName ?? '').trim();
      const title = n.payload.taskTitle;
      return i18n.t(actor ? 'notification.taskCommentedWithActor' : 'notification.taskCommented', {
        actor,
        title,
      });
    }
    case 'message_received': {
      const actor = (n.payload.actorName ?? '').trim();
      return i18n.t(actor ? 'notification.messageWithActor' : 'notification.newMessage', { actor });
    }
    case 'company_invite_accepted':
    case 'company_invite_rejected': {
      const actor = (n.payload.actorName ?? '').trim() || 'Davetli';
      return i18n.t(
        n.type === 'company_invite_accepted'
          ? 'notification.companyInviteAccepted'
          : 'notification.companyInviteRejected',
        { actor, companyName: n.payload.companyName },
      );
    }
    case 'task_status_pending': {
      const title = n.payload.taskTitle;
      const proposer = (n.payload.proposedByName ?? '').trim();
      const status = n.payload.proposedStatus ? STATUS_LABEL[n.payload.proposedStatus] : '';
      return i18n.t(
        proposer ? 'notification.taskStatusPendingWithActor' : 'notification.taskStatusPending',
        { proposer, title, status },
      );
    }
    case 'task_status_changed': {
      const title = n.payload.taskTitle;
      const actor = (n.payload.actorName ?? '').trim();
      const newStatus = n.payload.newStatus ? STATUS_LABEL[n.payload.newStatus] : '';
      return i18n.t(
        actor ? 'notification.taskStatusChangedWithActor' : 'notification.taskStatusChanged',
        { actor, title, status: newStatus },
      );
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
