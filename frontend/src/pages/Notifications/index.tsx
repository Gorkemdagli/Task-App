import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useNotifications,
  useMarkAllRead,
  useLoadMoreNotifications,
  type NotificationItem as NotificationItemType,
} from '@/hooks/useNotifications';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { EmptyNotifications } from '@/components/notifications/EmptyNotifications';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';

/**
 * Tüm bildirimleri listeleyen sayfa.
 * Topbar paneliyle aynı hook'u paylaşır (useNotifications — 30s polling),
 * ek olarak cursor pagination toplu yüklemeyi destekler.
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const { data } = useNotifications();
  const markAllRead = useMarkAllRead();

  const [accumulatedItems, setAccumulatedItems] = useState<NotificationItemType[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);

  useEffect(() => {
    if (data && accumulatedItems.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- RQ data is reactive, not event-driven; pagination state must sync from cache
      setAccumulatedItems(data.items);
      setCurrentCursor(data.nextCursor);
    }
  }, [data, accumulatedItems.length]);

  const loadMore = useLoadMoreNotifications(currentCursor);
  useEffect(() => {
    if (loadMore.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- RQ data is reactive, not event-driven; pagination state must sync from cache
      setAccumulatedItems((prev) => [...prev, ...loadMore.data!.items]);
      setCurrentCursor(loadMore.data!.nextCursor);
    }
  }, [loadMore.data]);

  const hasItems = accumulatedItems.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Bell className="h-5 w-5 text-primary" aria-hidden />
          Bildirimler
        </h1>
        {data && data.unreadCount > 0 && (
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

      {hasItems ? (
        <>
          <ul
            data-testid="notifications-page-list"
            className="flex flex-col divide-y divide-border"
            role="list"
          >
            {accumulatedItems.map((item) => (
              <li key={item.id}>
                <NotificationItem
                  item={item}
                  onNavigate={(taskId) => navigate(`/tasks/${taskId}`)}
                />
              </li>
            ))}
          </ul>

          {currentCursor && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => loadMore.refetch()}
                data-testid="page-load-more"
              >
                Daha fazla
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyNotifications />
      )}
    </div>
  );
}
