import { Link } from 'react-router-dom';
import type { CompanyDashboard } from '@/services/companyDashboard';
import { buildPriorityTasksUrl, buildStatusTasksUrl } from './companyDashboardNavigation';

type StatusBreakdown = CompanyDashboard['statusBreakdown'];
type PriorityBreakdown = CompanyDashboard['priorityBreakdown'];

const STATUS_SEGMENTS = [
  { key: 'todo', label: 'Yapılacak', color: 'text-status-todo' },
  { key: 'inProgress', label: 'Yapılıyor', color: 'text-status-inprogress' },
  { key: 'done', label: 'Yapıldı', color: 'text-status-done' },
] as const;

const PRIORITY_SEGMENTS = [
  { key: 'low', label: 'Düşük', color: 'bg-priority-low' },
  { key: 'medium', label: 'Orta', color: 'bg-priority-medium' },
  { key: 'high', label: 'Yüksek', color: 'bg-priority-high' },
] as const;

export function StatusDonut({
  breakdown,
  teamId,
}: {
  breakdown: StatusBreakdown;
  teamId: string | null;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const circles = STATUS_SEGMENTS.map((segment, index) => {
    const value = breakdown[segment.key];
    const length = (value.percentage / 100) * circumference;
    const offset = STATUS_SEGMENTS.slice(0, index).reduce(
      (total, previous) => total + (breakdown[previous.key].percentage / 100) * circumference,
      0,
    );
    const circle = {
      ...segment,
      length,
      offset,
      value,
    };
    return circle;
  });

  return (
    <section
      aria-labelledby="company-status-heading"
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 id="company-status-heading" className="text-lg font-semibold">
            Görev durumu
          </h2>
          <p className="text-sm text-secondary-foreground">Aktif görevlerin dağılımı</p>
        </div>
        <span className="text-sm text-secondary-foreground">{breakdown.total} görev</span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0">
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={`Görev durumu: ${breakdown.total} görev`}
            className="h-full w-full -rotate-90"
          >
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              className="stroke-border"
              strokeWidth="10"
            />
            {circles.map((circle) => (
              <circle
                key={circle.key}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                className={circle.color}
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={`${circle.length} ${circumference}`}
                strokeDashoffset={-circle.offset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold">{breakdown.total}</span>
            <span className="text-xs text-secondary-foreground">toplam</span>
          </div>
        </div>
        <div className="grid w-full gap-2">
          {circles.map((segment) => (
            <Link
              key={segment.key}
              to={buildStatusTasksUrl(
                segment.key === 'inProgress' ? 'in_progress' : segment.key,
                teamId,
              )}
              className="rounded-md border border-transparent px-2 py-1 text-sm hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${segment.label}: ${segment.value.count} görev, %${segment.value.percentage}; görevleri aç`}
            >
              <span>
                {segment.label}: {segment.value.count} görev, %{segment.value.percentage}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PriorityDistribution({
  breakdown,
  teamId,
}: {
  breakdown: PriorityBreakdown;
  teamId: string | null;
}) {
  return (
    <section
      aria-labelledby="company-priority-heading"
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 id="company-priority-heading" className="text-lg font-semibold">
            Açık görev önceliği
          </h2>
          <p className="text-sm text-secondary-foreground">Açık görevler içinde öncelik dağılımı</p>
        </div>
        <span className="text-sm text-secondary-foreground">{breakdown.total} görev</span>
      </div>
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-secondary"
        aria-label="Öncelik dağılımı"
      >
        {PRIORITY_SEGMENTS.map((segment) => {
          const value = breakdown[segment.key];
          if (value.percentage === 0) return null;
          return (
            <Link
              key={segment.key}
              to={buildPriorityTasksUrl(segment.key, teamId)}
              aria-label={`${segment.label}: ${value.count} görev, %${value.percentage}; görevleri aç`}
              className={`${segment.color} block h-full min-w-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset`}
              style={{ width: `${value.percentage}%` }}
            />
          );
        })}
      </div>
      <div className="mt-4 grid gap-2">
        {PRIORITY_SEGMENTS.map((segment) => {
          const value = breakdown[segment.key];
          const content = (
            <>
              <span className={`h-2.5 w-2.5 rounded-full ${segment.color}`} aria-hidden="true" />
              <span>
                {segment.label}: {value.count} görev, %{value.percentage}
              </span>
            </>
          );
          return (
            <div key={segment.key} className="flex items-center gap-2 px-2 py-1 text-sm">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
