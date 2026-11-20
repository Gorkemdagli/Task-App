import { useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CompanyDashboard } from '@/services/companyDashboard';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildPriorityTasksUrl, buildStatusTasksUrl } from './companyDashboardNavigation';

type StatusBreakdown = CompanyDashboard['statusBreakdown'];
type PriorityBreakdown = CompanyDashboard['priorityBreakdown'];
type TrendPoint = CompanyDashboard['createdVsCompleted'][number];
type ThroughputPoint = CompanyDashboard['throughput'][number];

const STATUS_SEGMENTS = [
  { key: 'todo', label: 'company.charts.todo', color: 'text-status-todo', marker: 'bg-status-todo' },
  {
    key: 'inProgress',
    label: 'company.charts.inProgress',
    color: 'text-status-inprogress',
    marker: 'bg-status-inprogress',
  },
  { key: 'done', label: 'company.charts.done', color: 'text-status-done', marker: 'bg-status-done' },
] as const;

const PRIORITY_SEGMENTS = [
  { key: 'low', label: 'company.charts.low', color: 'bg-priority-low' },
  { key: 'medium', label: 'company.charts.medium', color: 'bg-priority-medium' },
  { key: 'high', label: 'company.charts.high', color: 'bg-priority-high' },
] as const;

function RechartsFrame({ data, children, label, testId, renderPoint }: { data: object[]; children: ReactNode; label: string; testId: string; renderPoint: (index: number) => string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const visibleIndex = activeIndex === null || data.length === 0 ? null : Math.min(activeIndex, data.length - 1);
  const activate = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = rect.width ? ((event.clientX - rect.left) / rect.width - 0.04) / 0.92 : 0;
    setActiveIndex(Math.max(0, Math.min(data.length - 1, Math.round(position * (data.length - 1)))));
  };
  return <div role="group" aria-label={label} className="relative h-full min-h-0 w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-secondary-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} accessibilityLayer margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>{children}<CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="period" tickFormatter={(value: string) => value.slice(5)} tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} /><Tooltip contentStyle={{ borderRadius: 8, borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} formatter={(value) => new Intl.NumberFormat().format(Number(value ?? 0))} /></ComposedChart></ResponsiveContainer>{visibleIndex !== null && <div role="tooltip" className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs tabular-nums shadow-xl">{renderPoint(visibleIndex)}</div>}<div data-testid={testId} className="absolute inset-x-0 top-0 bottom-5 z-10" onPointerMove={activate} onPointerLeave={(event) => { if (event.pointerType !== 'touch') setActiveIndex(null); }} onClick={activate}>{data.map((_, index) => <span key={index} role="img" tabIndex={0} aria-label={renderPoint(index)} className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ left: `${data.length < 2 ? 50 : (index / (data.length - 1)) * 100}%`, top: '50%' }} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} onKeyDown={(event) => { if (event.key === 'Escape') setActiveIndex(null); }} />)}</div></div>;
}

export function PeriodTrendCharts({
  createdVsCompleted,
  throughput,
  cumulativeFlow,
}: {
  createdVsCompleted: TrendPoint[];
  throughput: ThroughputPoint[];
  cumulativeFlow?: CompanyDashboard['cumulativeFlow'];
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="company-created-completed-heading"
        className="flex h-64 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 md:p-5"
      >
        <div className="mb-2 shrink-0">
          <h2 id="company-created-completed-heading" className="text-lg font-semibold">
            {t('company.charts.createdCompleted')}
          </h2>
          <p className="text-sm text-secondary-foreground">{t('company.charts.selectedPeriodFlow')}</p>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col"
          role="group"
          aria-label={t('company.charts.createdCompletedTrend')}
        >
          {createdVsCompleted.length === 0 && (
            <p className="py-6 text-center text-sm text-secondary-foreground">
              {t('company.charts.noPeriodData')}
            </p>
          )}
          {createdVsCompleted.length > 0 && (
            <RechartsFrame data={createdVsCompleted} label={t('company.charts.createdCompletedTrend')} testId="company-trend-hit-surface" renderPoint={(index) => `${createdVsCompleted[index].period}: ${t('company.charts.created')}: ${createdVsCompleted[index].created} · ${t('company.charts.completed')}: ${createdVsCompleted[index].completed}`}><Line type="monotone" dataKey="created" name={t('company.charts.created')} stroke="var(--color-primary)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="completed" name={t('company.charts.completed')} stroke="var(--color-status-done)" strokeWidth={2} dot={false} /></RechartsFrame>
          )}
        </div>
        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-secondary-foreground">
          <span>
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-primary"
              aria-hidden="true"
            />
            {t('company.charts.created')}
          </span>
          <span>
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-status-done"
              aria-hidden="true"
            />
            {t('company.charts.completed')}
          </span>
        </div>
      </section>

      <section
        aria-labelledby="company-throughput-heading"
        className="flex h-64 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 md:p-5"
      >
        <div className="mb-2 shrink-0">
          <h2 id="company-throughput-heading" className="text-lg font-semibold">
            {t('company.charts.throughput')}
          </h2>
          <p className="text-sm text-secondary-foreground">{t('company.charts.completedPerPeriod')}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col" role="group" aria-label={t('company.charts.throughputTrend')}>
          {throughput.length === 0 && (
            <p className="py-6 text-center text-sm text-secondary-foreground">
              {t('company.charts.noPeriodData')}
            </p>
          )}
          {throughput.length > 0 && (
            <RechartsFrame data={throughput} label={t('company.charts.throughputTrend')} testId="company-throughput-hit-surface" renderPoint={(index) => `${throughput[index].period}: ${t('company.dashboard.completedTasks')}: ${throughput[index].count}`}><Bar dataKey="count" name={t('company.charts.completed')} fill="var(--color-primary)" radius={[3, 3, 0, 0]} /></RechartsFrame>
          )}
        </div>
      </section>

      {cumulativeFlow && (
        <section
          aria-labelledby="company-cumulative-flow-heading"
          className="flex h-64 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 md:col-span-2 md:p-5"
        >
          <div className="mb-2 shrink-0">
            <h2 id="company-cumulative-flow-heading" className="text-lg font-semibold">
              {t('company.charts.cumulativeFlow')}
            </h2>
            <p className="text-sm text-secondary-foreground">{t('company.charts.endOfDayStatuses')}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col" role="group" aria-label={t('company.charts.cumulativeFlowTrend')}>
            {cumulativeFlow.samples.length === 0 && (
              <p className="py-6 text-center text-sm text-secondary-foreground">{t('company.charts.noPeriodData')}</p>
            )}
            {cumulativeFlow.samples.length > 0 && (
              <RechartsFrame data={cumulativeFlow.samples.map(({ date, ...point }) => ({ period: date, ...point }))} label={t('company.charts.cumulativeFlowTrend')} testId="company-cumulative-flow-hit-surface" renderPoint={(index) => { const sample = cumulativeFlow.samples[index]; return `${sample.date}: ${t('company.charts.todo')}: ${sample.todo}, ${t('company.charts.inProgress')}: ${sample.inProgress}, ${t('company.charts.done')}: ${sample.done}`; }}><Area dataKey="todo" name={t('company.charts.todo')} stroke="var(--color-status-todo)" fill="var(--color-status-todo)" fillOpacity={0.12} /><Area dataKey="inProgress" name={t('company.charts.inProgress')} stroke="var(--color-status-inprogress)" fill="var(--color-status-inprogress)" fillOpacity={0.12} /><Area dataKey="done" name={t('company.charts.done')} stroke="var(--color-status-done)" fill="var(--color-status-done)" fillOpacity={0.12} /></RechartsFrame>
            )}
          </div>
          <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-secondary-foreground">
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-todo" aria-hidden="true" />{t('company.charts.todo')}</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-inprogress" aria-hidden="true" />{t('company.charts.inProgress')}</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-done" aria-hidden="true" />{t('company.charts.done')}</span>
          </div>
        </section>
      )}
    </div>
  );
}

export function StatusDonut({
  breakdown,
  teamId,
}: {
  breakdown: StatusBreakdown;
  teamId: string | null;
}) {
  const { t } = useTranslation();
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
      className="rounded-lg border border-border bg-card p-4 md:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 id="company-status-heading" className="text-lg font-semibold">
            {t('company.charts.taskStatus')}
          </h2>
          <p className="text-sm text-secondary-foreground">{t('company.charts.activeTaskDistribution')}</p>
        </div>
        <span className="text-sm text-secondary-foreground">
          {t('company.charts.tasks', { count: breakdown.total })}
        </span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative h-36 w-36 shrink-0">
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={t('company.charts.taskStatusLabel', { count: breakdown.total })}
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
            <span className="text-2xl font-semibold tabular-nums">{breakdown.total}</span>
            <span className="text-xs text-secondary-foreground">{t('company.charts.totalTasks')}</span>
          </div>
        </div>
        <div className="grid w-full gap-1.5">
          {circles.map((segment) => (
            <Link
              key={segment.key}
              to={buildStatusTasksUrl(
                segment.key === 'inProgress' ? 'in_progress' : segment.key,
                teamId,
              )}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t('company.charts.statusTasksLink', {
                label: t(segment.label),
                count: segment.value.count,
                percentage: segment.value.percentage,
              })}
            >
              <span className={`h-2.5 w-2.5 rounded-sm ${segment.marker}`} aria-hidden="true" />
              <span className="col-span-3">
                {t('company.charts.statusLegend', {
                  label: t(segment.label),
                  count: segment.value.count,
                  percentage: segment.value.percentage,
                })}
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
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="company-priority-heading"
      className="rounded-lg border border-border bg-card p-4 md:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 id="company-priority-heading" className="text-lg font-semibold">
            {t('company.charts.openTaskPriority')}
          </h2>
          <p className="text-sm text-secondary-foreground">{t('company.charts.openTaskPriorityDistribution')}</p>
        </div>
        <span className="text-sm text-secondary-foreground">
          {t('company.charts.tasks', { count: breakdown.total })}
        </span>
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-sm bg-secondary"
        aria-label={t('company.charts.priorityDistribution')}
      >
        {PRIORITY_SEGMENTS.map((segment) => {
          const value = breakdown[segment.key];
          if (value.percentage === 0) return null;
          return (
            <Link
              key={segment.key}
              to={buildPriorityTasksUrl(segment.key, teamId)}
              aria-label={t('company.charts.priorityTasksLink', {
                label: t(segment.label),
                count: value.count,
                percentage: value.percentage,
              })}
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
                {t('company.charts.statusLegend', {
                  label: t(segment.label),
                  count: value.count,
                  percentage: value.percentage,
                })}
              </span>
            </>
          );
          return (
            <div
              key={segment.key}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-2 py-1 text-xs"
            >
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
