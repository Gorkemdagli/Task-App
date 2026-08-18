import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps) {
  if (count <= 0) return null;

  const display = count > 9 ? '9+' : String(count);
  const label = count > 9 ? '9+ okunmamış bildirim' : `${count} okunmamış bildirim`;

  return (
    <span
      aria-label={label}
      data-testid="notification-badge"
      className={cn(
        'pointer-events-none absolute -right-0.5 -top-0.5 inline-flex',
        'h-4 min-w-[1rem] items-center justify-center rounded-full',
        'bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground',
      )}
    >
      {display}
    </span>
  );
}
