import { useTranslation } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';

function DashboardContentSkeleton() {
  return (
    <div data-testid="dashboard-content-skeleton" aria-hidden="true" className="p-4 md:p-8">
      <div className="mb-6 flex min-h-[150px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <Skeleton className="motion-reduce:animate-none h-7 w-44 max-w-full" />
          <Skeleton className="motion-reduce:animate-none h-4 w-24" />
        </div>
        <Skeleton className="motion-reduce:animate-none h-10 w-36 max-w-full rounded-md" />
      </div>
      <div className="grid min-h-0 grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <div key={column} className="min-w-0 rounded-md border-t-4 border-border bg-card/30 p-4">
            <Skeleton className="motion-reduce:animate-none mb-4 h-4 w-24 max-w-full" />
            <div className="space-y-3">
              <Skeleton className="motion-reduce:animate-none h-24 w-full rounded-md" />
              <Skeleton className="motion-reduce:animate-none h-24 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardScaffoldSkeleton() {
  return (
    <div
      data-testid="dashboard-route-skeleton"
      aria-hidden="true"
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="motion-reduce:animate-none h-8 w-8 md:hidden" />
          <Skeleton className="motion-reduce:animate-none h-6 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="motion-reduce:animate-none h-8 w-8 rounded-full" />
          <Skeleton className="motion-reduce:animate-none h-8 w-8 rounded-full" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[260px] shrink-0 border-r border-border bg-card p-4 md:block">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="motion-reduce:animate-none h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <DashboardContentSkeleton />
        </main>
      </div>
    </div>
  );
}

type RouteFallbackVariant = 'dashboard' | 'dashboard-content';

export function RouteFallback({ variant }: { variant?: RouteFallbackVariant } = {}) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="route-fallback"
      className={
        variant === 'dashboard'
          ? 'min-h-screen bg-background text-secondary-foreground'
          : variant === 'dashboard-content'
            ? 'bg-background text-secondary-foreground'
            : 'flex min-h-24 items-center justify-center bg-background text-secondary-foreground'
      }
      role="status"
      aria-label={t('Sayfa yükleniyor')}
    >
      <span className="sr-only">{t('Yükleniyor...')}</span>
      {variant === 'dashboard' ? (
        <DashboardScaffoldSkeleton />
      ) : variant === 'dashboard-content' ? (
        <DashboardContentSkeleton />
      ) : (
        <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
    </div>
  );
}
