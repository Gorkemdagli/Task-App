import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';
import type { CompanyInvitationDTO } from '@/services/companyInvitations';
import { CompanyInvitationCard } from '@/components/company/CompanyInvitationCard';
import { EmptyNotifications } from './EmptyNotifications';
import { NotificationItem } from './NotificationItem';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';

interface NotificationPanelProps {
  items: NotificationItemType[];
  unreadCount: number;
  onSelect: (item: NotificationItemType) => void;
  onMarkAllRead: () => void;
  onViewAll: () => void;
  invitations?: CompanyInvitationDTO[];
  notificationDataKnown?: boolean;
  invitationDataKnown?: boolean;
  notificationsLoading?: boolean;
  invitationsLoading?: boolean;
  notificationsError?: string;
  invitationListError?: string;
  onRetryNotifications?: () => void;
  onRetryInvitations?: () => void;
  onAcceptInvitation?: (id: string) => void;
  onRejectInvitation?: (id: string) => void;
  isAcceptingInvitation?: boolean;
  isRejectingInvitation?: boolean;
  invitationError?: string;
}

export function NotificationPanel({
  items,
  unreadCount,
  onSelect,
  onMarkAllRead,
  onViewAll,
  invitations = [],
  notificationDataKnown = true,
  invitationDataKnown = true,
  notificationsLoading = false,
  invitationsLoading = false,
  notificationsError,
  invitationListError,
  onRetryNotifications,
  onRetryInvitations,
  onAcceptInvitation = () => undefined,
  onRejectInvitation = () => undefined,
  isAcceptingInvitation = false,
  isRejectingInvitation = false,
  invitationError,
}: NotificationPanelProps) {
  const { t } = useTranslation();
  const hasItems = items.length > 0;
  const hasInvitations = invitations.length > 0;

  return (
    <div className="flex w-80 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{t('Bildirimler')}</h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-medium text-primary hover:underline"
            data-testid="mark-all-read"
          >
            {t('Tümünü okundu işaretle')}
          </button>
        )}
      </div>
      <DropdownMenuSeparator className="bg-border" />

      {notificationsError && (
        <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-destructive">
          <span>{notificationsError}</span>
          {onRetryNotifications && (
            <Button type="button" variant="ghost" size="sm" onClick={onRetryNotifications}>
              {t('Yeniden dene')}
            </Button>
          )}
        </div>
      )}

      {invitationListError && (
        <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-destructive">
          <span>{invitationListError}</span>
          {onRetryInvitations && (
            <Button type="button" variant="ghost" size="sm" onClick={onRetryInvitations}>
              {t('Yeniden dene')}
            </Button>
          )}
        </div>
      )}

      {((notificationsLoading && !notificationDataKnown) ||
        (invitationsLoading && !invitationDataKnown)) && (
        <p aria-busy="true" className="px-4 py-3 text-sm text-muted-foreground">
          {t('Yükleniyor...')}
        </p>
      )}

      {hasInvitations && (
        <section data-testid="company-invitation-list" className="border-b border-border">
          <h4 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('Şirket davetleri')}
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

        </>
      ) : !hasInvitations ? (
        notificationDataKnown && invitationDataKnown ? <EmptyNotifications /> : null
      ) : null}

      <div className="border-t border-border px-4 py-2">
        <Link
          onClick={onViewAll}
          data-testid="view-all-notifications"
          to="/notifications"
          className="w-full text-center text-xs font-medium text-primary hover:underline"
        >
          {t('Tüm bildirimleri gör')}
        </Link>
      </div>
    </div>
  );
}
