import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { notificationActorInitials, notificationCopy } from '@/lib/notificationCopy';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';

interface NotificationItemProps {
  item: NotificationItemType;
  onSelect: (item: NotificationItemType) => void;
  onAutoRead?: (id: string) => void;
}

function timeAgo(iso: string, language: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);
  if (language !== 'en') {
    if (abs < 60) return 'az önce';
    if (abs < 3600) return `${Math.round(abs / 60)} dakika önce`;
    if (abs < 86400) return `${Math.round(abs / 3600)} saat önce`;
    return `${Math.round(abs / 86400)} gün önce`;
  }
  const relativeTime = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  if (abs < 60) return 'just now';
  if (abs < 3600) return relativeTime.format(-Math.round(abs / 60), 'minute');
  if (abs < 86400) return relativeTime.format(-Math.round(abs / 3600), 'hour');
  return relativeTime.format(-Math.round(abs / 86400), 'day');
}

export function NotificationItem({ item, onSelect, onAutoRead }: NotificationItemProps) {
  const { i18n } = useTranslation();
  const itemElement = useRef<HTMLElement | null>(null);
  const autoReadAttempted = useRef(false);
  const isUnread = item.readAt === null;
  const initials = notificationActorInitials(item.payload.actorName ?? null);
  const text = notificationCopy(item);

  useEffect(() => {
    const element = itemElement.current;
    if (
      !element ||
      !onAutoRead ||
      item.readAt !== null ||
      typeof IntersectionObserver === 'undefined'
    ) return;

    let isVisibleEnough = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopDwell = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const startDwell = () => {
      if (autoReadAttempted.current || timer !== undefined || document.visibilityState !== 'visible') {
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        if (!isVisibleEnough || document.visibilityState !== 'visible') return;
        autoReadAttempted.current = true;
        onAutoRead(item.id);
      }, 1_000);
    };
    const observer = new IntersectionObserver(([entry]) => {
      isVisibleEnough = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5);
      if (isVisibleEnough) startDwell();
      else stopDwell();
    }, { threshold: 0.5 });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') startDwell();
      else stopDwell();
    };

    observer.observe(element);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopDwell();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [item.id, item.readAt, onAutoRead]);

  const setItemElement = useCallback((element: HTMLDivElement | HTMLButtonElement | null) => {
    itemElement.current = element;
  }, []);

  const content = (
    <>
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
        <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt, i18n.language)}</span>
      </span>
    </>
  );

  if (
    item.type === 'message_received' ||
    item.type === 'company_invite_accepted' ||
    item.type === 'company_invite_rejected'
  ) {
    return (
      <div
        ref={setItemElement}
        data-testid={`notification-item-${item.id}`}
        className="flex w-full items-start gap-3 px-3 py-2 text-left"
      >
        {content}
      </div>
    );
  }

  return (
    <button
        ref={setItemElement}
      type="button"
      data-testid={`notification-item-${item.id}`}
      onClick={() => onSelect(item)}
      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-secondary focus:bg-secondary focus:outline-none"
    >
      {content}
    </button>
  );
}
