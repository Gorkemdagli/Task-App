import { cn } from '@/lib/utils';
import {
  notificationActorInitials,
  notificationCopy,
  type NotificationPayload,
  type NotificationType,
} from '@/lib/notificationCopy';

interface NotificationItemProps {
  item: {
    id: string;
    type: NotificationType;
    payload: NotificationPayload;
    readAt: string | null;
    createdAt: string;
  };
  onNavigate: (taskId: string) => void;
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return `${Math.round(abs / 60)} dakika önce`;
  if (abs < 86400) return `${Math.round(abs / 3600)} saat önce`;
  return `${Math.round(abs / 86400)} gün önce`;
}

export function NotificationItem({ item, onNavigate }: NotificationItemProps) {
  const isUnread = item.readAt === null;
  const initials = notificationActorInitials(item.payload.actorName ?? null);
  const text = notificationCopy({ type: item.type, payload: item.payload });

  return (
    <button
      type="button"
      data-testid={`notification-item-${item.id}`}
      onClick={() => onNavigate(item.payload.taskId)}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-2 text-left',
        'hover:bg-secondary focus:bg-secondary focus:outline-none',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-1 h-8 w-0.5 shrink-0 rounded-full',
          isUnread ? 'bg-primary' : 'bg-transparent',
        )}
      />

      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground"
        aria-hidden
      >
        {initials}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-sm text-foreground">{text}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
      </span>
    </button>
  );
}
