import { Button } from '@/components/ui/button';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';
import type { CompanyInvitationDTO } from '@/services/companyInvitations';
import { CompanyInvitationCard } from '@/components/company/CompanyInvitationCard';
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
  invitations?: CompanyInvitationDTO[];
  onAcceptInvitation?: (id: string) => void;
  onRejectInvitation?: (id: string) => void;
  isAcceptingInvitation?: boolean;
  isRejectingInvitation?: boolean;
  invitationError?: string;
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
  invitations = [],
  onAcceptInvitation = () => undefined,
  onRejectInvitation = () => undefined,
  isAcceptingInvitation = false,
  isRejectingInvitation = false,
  invitationError,
}: NotificationPanelProps) {
  const hasItems = items.length > 0;
  const hasInvitations = invitations.length > 0;

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

      {hasInvitations && (
        <section data-testid="company-invitation-list" className="border-b border-border">
          <h4 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Şirket davetleri
          </h4>
          <div className="flex flex-col gap-2 px-2 pb-2">
            {invitations.map((invitation) => (
              <CompanyInvitationCard
                key={invitation.id}
                invitation={invitation}
                onAccept={onAcceptInvitation}
                onReject={onRejectInvitation}
                isAccepting={isAcceptingInvitation}
                isRejecting={isRejectingInvitation}
                error={invitationError}
              />
            ))}
          </div>
        </section>
      )}

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
      ) : !hasInvitations ? (
        <EmptyNotifications />
      ) : null}

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
