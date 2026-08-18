import { Button } from '@/components/ui/button';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';
import { EmptyNotifications } from './EmptyNotifications';
import { NotificationItem } from './NotificationItem';

interface NotificationPanelProps {
  items: NotificationItemType[];
  unreadCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onSelect: (item: NotificationItemType) => void;
  onMarkAllRead: () => void;
  onViewAll: () => void;
}

export function NotificationPanel({
  items,
  unreadCount,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onSelect,
  onMarkAllRead,
  onViewAll,
}: NotificationPanelProps) {
  const hasItems = items.length > 0;

  return (
    <div className="flex w-80 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Bildirimler</h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-medium text-primary hover:underline"
            data-testid="mark-all-read"
          >
            Tümünü okundu işaretle
          </button>
        )}
      </div>
      <DropdownMenuSeparator className="bg-border" />

      {hasItems ? (
        <>
          <ul
            data-testid="notification-list"
            className="max-h-[320px] overflow-y-auto py-1"
            role="list"
          >
            {items.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} onSelect={onSelect} />
              </li>
            ))}
          </ul>

          {hasNextPage && (
            <div className="border-t border-border px-2 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                disabled={isFetchingNextPage}
                className="w-full"
              >
                Daha fazla
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyNotifications />
      )}

      <div className="border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={onViewAll}
          data-testid="view-all-notifications"
          className="w-full text-center text-xs font-medium text-primary hover:underline"
        >
          Tümünü gör
        </button>
      </div>
    </div>
  );
}
