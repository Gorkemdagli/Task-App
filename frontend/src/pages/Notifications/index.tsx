import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationItem as NotificationItemType,
} from '@/hooks/useNotifications';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { EmptyNotifications } from '@/components/notifications/EmptyNotifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Bell } from 'lucide-react';
import { MAX_RENDERED_RECORDS, RECORD_CAP_MESSAGE } from '@/lib/listLimits';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function labelForDay(d: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Bugün';
  if (diffDays === 1) return 'Dün';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

interface DayGroup {
  key: string;
  label: string;
  items: NotificationItemType[];
}

function groupByDay(items: NotificationItemType[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = dayKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: labelForDay(d, now), items: [item] });
  }
  return groups;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();
  const items = useMemo(
    () =>
      (notifications.data?.pages.flatMap((page) => page.items) ?? []).slice(
        0,
        MAX_RENDERED_RECORDS,
      ),
    [notifications.data],
  );
  const unreadCount = notifications.data?.pages[0]?.unreadCount ?? 0;
  const groups = useMemo(() => groupByDay(items, new Date()), [items]);

  function handleSelect(item: NotificationItemType) {
    if (item.type === 'message_received') return;
    if (item.readAt === null) markRead.mutate(item.id);
    navigate(`/tasks/${item.payload.taskId}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Bell className="h-5 w-5 text-primary" aria-hidden />
          Bildirimler
        </h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            data-testid="page-mark-all-read"
            className="text-sm font-medium text-primary hover:underline"
          >
            Tümünü okundu işaretle
          </button>
        )}
      </header>

      {notifications.isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Bildirimler yüklenemedi.
        </div>
      )}

      {notifications.isPending ? (
        <ul data-testid="notifications-page-skeleton" className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-md bg-secondary" />
          ))}
        </ul>
      ) : items.length > 0 ? (
        <>
          <ul data-testid="notifications-page-list" className="flex flex-col" role="list">
            {groups.map((group) => (
              <li key={group.key} className="flex flex-col">
                <h2 className="px-1 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
                <ul
                  className={cn(
                    'flex flex-col divide-y divide-border rounded-md border border-border bg-card',
                  )}
                  role="list"
                >
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NotificationItem item={item} onSelect={handleSelect} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {(notifications.data?.pages.flatMap((page) => page.items).length ?? 0) >
            MAX_RENDERED_RECORDS && (
            <p className="text-xs text-muted-foreground">{RECORD_CAP_MESSAGE}</p>
          )}

          {notifications.hasNextPage && items.length < MAX_RENDERED_RECORDS && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => notifications.fetchNextPage()}
              disabled={notifications.isFetchingNextPage}
            >
              Daha fazla
            </Button>
          )}
        </>
      ) : (
        <EmptyNotifications />
      )}
    </div>
  );
}
