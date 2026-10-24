import { useTranslation } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLoadingSkeleton, type PageLoadingSkeletonVariant } from './PageLoadingSkeleton';

type ProtectedRouteSkeletonVariant = 'dashboard' | PageLoadingSkeletonVariant;
type RouteFallbackVariant = ProtectedRouteSkeletonVariant | 'dashboard-content';

export function getProtectedRouteSkeletonVariant(pathname: string): ProtectedRouteSkeletonVariant | undefined {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname === '/company/settings') return 'board';
  if (pathname === '/company') return 'board';
  if (pathname === '/tasks') return 'table';
  if (pathname === '/teams') return 'table';
  if (pathname === '/notifications') return 'list';
  if (pathname === '/profile') return 'form';
  if (pathname === '/permissions') return 'table';
  if (/^\/tasks\/[^/]+\/?$/.test(pathname) || /^\/teams\/[^/]+\/?$/.test(pathname)) return 'detail';
  if (/^\/chat\/[^/]+\/?$/.test(pathname)) return 'communication';
  return undefined;
}

function RouteScaffoldSkeleton({ variant }: { variant: 'dashboard' | PageLoadingSkeletonVariant }) {
  const dashboard = variant === 'dashboard';
  return (
    <div
      data-testid={dashboard ? 'dashboard-route-skeleton' : 'route-shell-skeleton'}
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground"
    >
      <header aria-hidden="true" className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
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
        <aside aria-hidden="true" className="hidden w-[260px] shrink-0 border-r border-border bg-card p-4 md:block">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="motion-reduce:animate-none h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <PageLoadingSkeleton variant={dashboard ? 'board' : variant} />
        </main>
      </div>
    </div>
  );
}

export function RouteFallback(
  { variant, contentOnly = false }: { variant?: RouteFallbackVariant; contentOnly?: boolean } = {},
) {
  const { t } = useTranslation();
  const pageVariant = variant === 'dashboard' || variant === 'dashboard-content' ? 'board' : variant;

  if (pageVariant) {
    const showContent = contentOnly || variant === 'dashboard-content';
    const scaffoldVariant =
      variant === 'dashboard' || variant === 'dashboard-content'
        ? 'dashboard'
        : pageVariant;
    return (
      <div
        data-testid="route-fallback"
        className={showContent ? 'bg-background text-secondary-foreground' : 'min-h-screen bg-background text-secondary-foreground'}
      >
        {showContent ? <PageLoadingSkeleton variant={pageVariant} /> : <RouteScaffoldSkeleton variant={scaffoldVariant} />}
      </div>
    );
  }

  return (
    <div
      data-testid="route-fallback"
      className="flex min-h-24 items-center justify-center bg-background text-secondary-foreground"
      role="status"
      aria-label={t('Sayfa yükleniyor')}
    >
      <span className="sr-only">{t('Yükleniyor...')}</span>
      <span aria-hidden="true" className="motion-reduce:animate-none inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    </div>
  );
}
