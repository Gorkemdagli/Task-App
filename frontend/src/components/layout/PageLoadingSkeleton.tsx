import { useTranslation } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';

export type PageLoadingSkeletonVariant = 'list' | 'table' | 'detail' | 'form' | 'board' | 'communication';

const motion = 'motion-reduce:animate-none';

function Heading({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex min-h-16 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className={`${motion} h-7 w-44 max-w-full`} />
        <Skeleton className={`${motion} h-4 w-28`} />
      </div>
      {action && <Skeleton className={`${motion} h-10 w-36 max-w-full rounded-md`} />}
    </div>
  );
}

function DashboardBoard() {
  return (
    <div data-testid="dashboard-content-skeleton" className="p-4 md:p-8">
      <div className="mb-6 flex min-h-[150px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <Skeleton className={`${motion} h-7 w-44 max-w-full`} />
          <Skeleton className={`${motion} h-4 w-24`} />
        </div>
        <Skeleton className={`${motion} h-10 w-36 max-w-full rounded-md`} />
      </div>
      <div className="grid min-h-0 grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <div key={column} className="min-w-0 rounded-md border-t-4 border-border bg-card/30 p-4">
            <Skeleton className={`${motion} mb-4 h-4 w-24 max-w-full`} />
            <div className="space-y-3">
              <Skeleton className={`${motion} h-24 w-full rounded-md`} />
              <Skeleton className={`${motion} h-24 w-full rounded-md`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function List() {
  return (
    <>
      <Heading />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex min-w-0 items-center gap-4 rounded-md border border-border bg-card/30 p-4">
            <Skeleton className={`${motion} h-10 w-10 shrink-0 rounded-full`} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={`${motion} h-4 w-2/5 max-w-full`} />
              <Skeleton className={`${motion} h-3 w-3/5 max-w-full`} />
            </div>
            <Skeleton className={`${motion} h-6 w-16 shrink-0 rounded-full`} />
          </div>
        ))}
      </div>
    </>
  );
}

function Table() {
  return (
    <>
      <Heading />
      <Skeleton className={`${motion} h-10 w-full max-w-md rounded-md`} />
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex gap-6 border-b border-border bg-card/30 p-4">
          {[0, 1, 2, 3].map((column) => (
            <Skeleton key={column} className={`${motion} h-4 flex-1`} />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex gap-6 border-b border-border p-4 last:border-b-0">
            {[0, 1, 2, 3].map((column) => (
              <Skeleton key={column} className={`${motion} h-4 flex-1`} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function Detail() {
  return (
    <>
      <Heading />
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
        <div className="space-y-4 rounded-md border border-border bg-card/30 p-4 md:p-6">
          <Skeleton className={`${motion} h-5 w-2/3 max-w-full`} />
          <Skeleton className={`${motion} h-4 w-full`} />
          <Skeleton className={`${motion} h-4 w-5/6 max-w-full`} />
          <Skeleton className={`${motion} h-32 w-full rounded-md`} />
          <Skeleton className={`${motion} h-4 w-3/4 max-w-full`} />
        </div>
        <div className="space-y-4 rounded-md border border-border bg-card/30 p-4">
          <Skeleton className={`${motion} h-4 w-24`} />
          {[0, 1, 2].map((row) => <Skeleton key={row} className={`${motion} h-9 w-full rounded-md`} />)}
        </div>
      </div>
    </>
  );
}

function Form() {
  return (
    <>
      <Heading action={false} />
      <div className="max-w-2xl space-y-6 rounded-md border border-border bg-card/30 p-4 md:p-6">
        {[0, 1, 2, 3].map((field) => (
          <div key={field} className="space-y-2">
            <Skeleton className={`${motion} h-4 w-28`} />
            <Skeleton className={`${motion} h-10 w-full rounded-md`} />
          </div>
        ))}
        <Skeleton className={`${motion} h-10 w-36 rounded-md`} />
      </div>
    </>
  );
}

function Communication() {
  return (
    <>
      <Heading action={false} />
      <div className="grid min-h-[420px] min-w-0 grid-cols-1 overflow-hidden rounded-md border border-border bg-card/30 md:grid-cols-[minmax(180px,280px)_minmax(0,1fr)]">
        <div className="hidden space-y-3 border-r border-border p-4 md:block">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-md p-2">
              <Skeleton className={`${motion} h-9 w-9 shrink-0 rounded-full`} />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={`${motion} h-3 w-3/5 max-w-full`} />
                <Skeleton className={`${motion} h-3 w-4/5 max-w-full`} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col justify-between p-4">
          <div className="space-y-4">
            <Skeleton className={`${motion} h-10 w-2/3 max-w-full rounded-2xl`} />
            <Skeleton className={`${motion} ml-auto h-10 w-1/2 max-w-full rounded-2xl`} />
            <Skeleton className={`${motion} h-14 w-3/4 max-w-full rounded-2xl`} />
          </div>
          <Skeleton className={`${motion} h-11 w-full rounded-md`} />
        </div>
      </div>
    </>
  );
}

function Shape({ variant }: { variant: PageLoadingSkeletonVariant }) {
  switch (variant) {
    case 'board': return <DashboardBoard />;
    case 'list': return <List />;
    case 'table': return <Table />;
    case 'detail': return <Detail />;
    case 'form': return <Form />;
    case 'communication': return <Communication />;
  }
}

export function PageLoadingSkeleton({ variant }: { variant: PageLoadingSkeletonVariant }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="page-loading-skeleton"
      data-variant={variant}
      role="status"
      aria-label={t('Sayfa yükleniyor')}
      className="min-w-0"
    >
      <span className="sr-only">{t('Yükleniyor...')}</span>
      <div aria-hidden="true"><Shape variant={variant} /></div>
    </div>
  );
}
