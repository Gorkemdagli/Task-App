import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useNotifications,
  useMarkAllRead,
  type NotificationItem as NotificationItemType,
} from '@/hooks/useNotifications';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { EmptyNotifications } from '@/components/notifications/EmptyNotifications';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 10;

interface PageData {
  items: NotificationItemType[];
  nextCursor: string | null;
}

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
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: labelForDay(d, now), items: [item] });
    }
  }
  return groups;
}

/**
 * Tüm bildirimleri listeleyen sayfa.
 * 10'ar adet sayfalanır; her sayfa tarihe göre (Bugün / Dün / gg.aa.yyyy) gruplanır.
 * Cursor stack sayesinde Önceki mümkün; cursor ileri-yönlü olduğundan Prev
 * eski sayfanın nextCursor değerini yeniden sorgular.
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const { data } = useNotifications();
  const markAllRead = useMarkAllRead();

  const [cursors, setCursors] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- imperative fetch on pageIndex change; cancelling prior request is correct
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- imperative fetch on pageIndex change
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- imperative fetch on pageIndex change
    setError(null);

    const cursor = pageIndex === 0 ? null : cursors[pageIndex - 1] ?? null;
    const url = cursor
      ? `/notifications?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
      : `/notifications?limit=${PAGE_SIZE}`;

    api
      .get<{ items: NotificationItemType[]; nextCursor: string | null }>(url, {
        signal: controller.signal,
      })
      .then((res) => {
        setPageData({ items: res.data.items, nextCursor: res.data.nextCursor });
        const newNextCursor = res.data.nextCursor;
        if (newNextCursor) {
          setCursors((prev) =>
            prev.includes(newNextCursor) ? prev : [...prev, newNextCursor],
          );
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return;
        setError('Bildirimler yüklenemedi.');
        setLoading(false);
      });

    return () => controller.abort();
    // cursors read at call time only — re-running on cursor change would re-trigger infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex]);

  // Sayfa sayısını önceden keşfetmek için limit=1 ile ileri yürüyüş.
  // Sadece nextCursor'a bakılır — kullanıcı sayfaya tıklayana kadar gerçek veri çekilmez.
  useEffect(() => {
    const lastCursor = cursors[cursors.length - 1];
    if (!lastCursor) return;
    const controller = new AbortController();
    api
      .get<{ items: NotificationItemType[]; nextCursor: string | null }>(
        `/notifications?limit=1&cursor=${encodeURIComponent(lastCursor)}`,
        { signal: controller.signal },
      )
      .then((res) => {
        const newNextCursor = res.data.nextCursor;
        if (newNextCursor) {
          setCursors((prev) =>
            prev.includes(newNextCursor) ? prev : [...prev, newNextCursor],
          );
        }
      })
      .catch(() => {
        /* walk silent fail — UI navigasyonu bozmaz */
      });
    return () => controller.abort();
  }, [cursors]);

  const groups = useMemo(
    () => (pageData ? groupByDay(pageData.items, new Date()) : []),
    [pageData],
  );

  const hasItems = (pageData?.items.length ?? 0) > 0;
  const hasNext = Boolean(pageData?.nextCursor);
  const hasPrev = pageIndex > 0;

  const handlePrev = () => {
    if (hasPrev) setPageIndex(pageIndex - 1);
  };

  const handleNext = () => {
    if (hasNext) setPageIndex(pageIndex + 1);
  };

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

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {loading && !pageData ? (
        <ul
          data-testid="notifications-page-skeleton"
          className="flex flex-col gap-2"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-md bg-secondary" />
          ))}
        </ul>
      ) : hasItems ? (
        <>
          <ul
            data-testid="notifications-page-list"
            className="flex flex-col"
            role="list"
          >
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
                      <NotificationItem
                        item={item}
                        onNavigate={(taskId) => navigate(`/tasks/${taskId}`)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <nav
            className="flex items-center justify-center gap-1 pt-2"
            aria-label="Bildirim sayfaları"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePrev}
              disabled={!hasPrev}
              data-testid="page-prev"
              aria-label="Önceki sayfa"
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
              Önceki
            </Button>

            {Array.from({ length: cursors.length + 1 }, (_, i) => i + 1).map(
              (pageNum) => {
                const isActive = pageNum === pageIndex + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPageIndex(pageNum - 1)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`Sayfa ${pageNum}`}
                    data-testid={`page-num-${pageNum}`}
                    className={cn(
                      'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-foreground hover:bg-secondary',
                    )}
                  >
                    {pageNum}
                  </button>
                );
              },
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleNext}
              disabled={!hasNext}
              data-testid="page-next"
              aria-label="Sonraki sayfa"
            >
              Sonraki
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          </nav>
        </>
      ) : (
        <EmptyNotifications />
      )}
    </div>
  );
}
