import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import type { CompanyDashboard } from '@/services/companyDashboard';
import { buildPriorityTasksUrl, buildStatusTasksUrl } from './companyDashboardNavigation';

type StatusBreakdown = CompanyDashboard['statusBreakdown'];
type PriorityBreakdown = CompanyDashboard['priorityBreakdown'];
type TrendPoint = CompanyDashboard['createdVsCompleted'][number];
type ThroughputPoint = CompanyDashboard['throughput'][number];
type CumulativeFlowPoint = NonNullable<CompanyDashboard['cumulativeFlow']>['samples'][number];

const STATUS_SEGMENTS = [
  { key: 'todo', label: 'Yapılacak', color: 'text-status-todo', marker: 'bg-status-todo' },
  {
    key: 'inProgress',
    label: 'Yapılıyor',
    color: 'text-status-inprogress',
    marker: 'bg-status-inprogress',
  },
  { key: 'done', label: 'Yapıldı', color: 'text-status-done', marker: 'bg-status-done' },
] as const;

const PRIORITY_SEGMENTS = [
  { key: 'low', label: 'Düşük', color: 'bg-priority-low' },
  { key: 'medium', label: 'Orta', color: 'bg-priority-medium' },
  { key: 'high', label: 'Yüksek', color: 'bg-priority-high' },
] as const;

const CHART_BOTTOM = 46;
const CHART_HEIGHT = 36;
const CHART_SIDE_PADDING = 4;

function chartX(index: number, count: number) {
  return count === 1
    ? 50
    : CHART_SIDE_PADDING + (index / (count - 1)) * (100 - CHART_SIDE_PADDING * 2);
}

function chartY(value: number, max: number) {
  return CHART_BOTTOM - (value / max) * CHART_HEIGHT;
}

function chartLabels(count: number) {
  return count <= 1 ? new Set([0]) : new Set([0, count - 1]);
}

function ChartTooltip({ x, children }: { x: number; children: string }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-panel"
      style={{ left: `${Math.min(88, Math.max(12, x))}%` }}
    >
      {children}
    </div>
  );
}

function nearestChartIndex(
  event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>,
  count: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = rect.width;
  if (!width) return 0;
  const position = (event.clientX - rect.left) / width;
  const padding = CHART_SIDE_PADDING / 100;
  const plotPosition = (position - padding) / (1 - padding * 2);
  const clampedPosition = Math.max(0, Math.min(1, plotPosition));
  return Math.round(clampedPosition * (count - 1));
}

function ChartInteractionSurface({
  testId,
  count,
  onActivate,
  onDeactivate,
  children,
}: {
  testId: string;
  count: number;
  onActivate: (index: number) => void;
  onDeactivate: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="absolute inset-x-0 top-0 bottom-5 z-10"
      onPointerMove={(event) => onActivate(nearestChartIndex(event, count))}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') onDeactivate();
      }}
      onClick={(event) => onActivate(nearestChartIndex(event, count))}
    >
      {children}
    </div>
  );
}

function ChartDataPoint({
  x,
  top,
  label,
  onActivate,
  onDeactivate,
}: {
  x: number;
  top: string;
  label: string;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  return (
    <span
      role="img"
      tabIndex={0}
      aria-label={label}
      title={label}
      onFocus={onActivate}
      onBlur={onDeactivate}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onDeactivate();
          event.currentTarget.blur();
        }
      }}
      className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      style={{ left: `${x}%`, top }}
    />
  );
}

function TrendChart({ points, max }: { points: TrendPoint[]; max: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const labels = chartLabels(points.length);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const createdPath = points
    .map((point, index) => `${chartX(index, points.length)},${chartY(point.created, max)}`)
    .join(' ');
  const completedPath = points
    .map((point, index) => `${chartX(index, points.length)},${chartY(point.completed, max)}`)
    .join(' ');

  return (
    <div className="relative min-h-0 flex-1" data-testid="company-trend-chart">
      <svg viewBox="0 0 100 64" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <line x1="0" y1={CHART_BOTTOM} x2="100" y2={CHART_BOTTOM} className="stroke-border" />
        {createdPath && (
          <polyline points={createdPath} fill="none" className="stroke-primary" strokeWidth="1.5" />
        )}
        {completedPath && (
          <polyline
            points={completedPath}
            fill="none"
            className="stroke-status-done"
            strokeWidth="1.5"
          />
        )}
        {points.map((point, index) => {
          const x = chartX(index, points.length);
          return (
            <g key={point.period} aria-hidden="true">
              <circle cx={x} cy={chartY(point.created, max)} r="1.5" className="fill-primary" />
              <circle
                cx={x}
                cy={chartY(point.completed, max)}
                r="1.5"
                className="fill-status-done"
              />
              {labels.has(index) && (
                <text
                  x={x}
                  y="61"
                  textAnchor="middle"
                  className="fill-secondary-foreground text-xs"
                >
                  {point.period.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {activePoint && activeIndex !== null && (
        <ChartTooltip x={chartX(activeIndex, points.length)}>
          {`${activePoint.period} · Oluşturulan: ${activePoint.created} · Tamamlanan: ${activePoint.completed}`}
        </ChartTooltip>
      )}
      <ChartInteractionSurface
        testId="company-trend-hit-surface"
        count={points.length}
        onActivate={setActiveIndex}
        onDeactivate={() => setActiveIndex(null)}
      >
        {points.map((point, index) => (
          <ChartDataPoint
            key={point.period}
            x={chartX(index, points.length)}
            top={`${(chartY(Math.max(point.created, point.completed), max) / CHART_BOTTOM) * 100}%`}
            label={`${point.period}: Oluşturulan: ${point.created}, Tamamlanan: ${point.completed}`}
            onActivate={() => setActiveIndex(index)}
            onDeactivate={() => setActiveIndex(null)}
          />
        ))}
      </ChartInteractionSurface>
    </div>
  );
}

function ThroughputChart({ points, max }: { points: ThroughputPoint[]; max: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const labels = chartLabels(points.length);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  return (
    <div className="relative min-h-0 flex-1" data-testid="company-throughput-chart">
      <svg viewBox="0 0 100 64" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <line x1="0" y1={CHART_BOTTOM} x2="100" y2={CHART_BOTTOM} className="stroke-border" />
        {points.map((point, index) => {
          const x = chartX(index, points.length);
          const height = Math.max(1, (point.count / max) * CHART_HEIGHT);
          return (
            <g key={point.period} aria-hidden="true">
              <rect
                x={x - 1.4}
                y={CHART_BOTTOM - height}
                width="2.8"
                height={height}
                rx="0.5"
                className="fill-primary"
              />
              {labels.has(index) && (
                <text
                  x={x}
                  y="61"
                  textAnchor="middle"
                  className="fill-secondary-foreground text-xs"
                >
                  {point.period.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {activePoint && activeIndex !== null && (
        <ChartTooltip x={chartX(activeIndex, points.length)}>
          {`${activePoint.period} · Tamamlanan görev: ${activePoint.count}`}
        </ChartTooltip>
      )}
      <ChartInteractionSurface
        testId="company-throughput-hit-surface"
        count={points.length}
        onActivate={setActiveIndex}
        onDeactivate={() => setActiveIndex(null)}
      >
        {points.map((point, index) => {
          const height = Math.max(1, (point.count / max) * CHART_HEIGHT);
          return (
            <ChartDataPoint
              key={point.period}
              x={chartX(index, points.length)}
              top={`${((CHART_BOTTOM - height) / CHART_BOTTOM) * 100}%`}
              label={`${point.period}: Tamamlanan görev: ${point.count}`}
              onActivate={() => setActiveIndex(index)}
              onDeactivate={() => setActiveIndex(null)}
            />
          );
        })}
      </ChartInteractionSurface>
    </div>
  );
}

function CumulativeFlowChart({ points, max }: { points: CumulativeFlowPoint[]; max: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const labels = chartLabels(points.length);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const series = [
    { key: 'todo', stroke: 'stroke-status-todo', fill: 'fill-status-todo' },
    { key: 'inProgress', stroke: 'stroke-status-inprogress', fill: 'fill-status-inprogress' },
    { key: 'done', stroke: 'stroke-status-done', fill: 'fill-status-done' },
  ] as const;

  return (
    <div className="relative min-h-0 flex-1" data-testid="company-cumulative-flow-chart">
      <svg viewBox="0 0 100 64" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <line x1="0" y1={CHART_BOTTOM} x2="100" y2={CHART_BOTTOM} className="stroke-border" />
        {series.map((item) => (
          <polyline
            key={item.key}
            points={points
              .map((point, index) => `${chartX(index, points.length)},${chartY(point[item.key], max)}`)
              .join(' ')}
            fill="none"
            className={item.stroke}
            strokeWidth="1.5"
          />
        ))}
        {points.map((point, index) => {
          const x = chartX(index, points.length);
          return (
            <g key={point.date} aria-hidden="true">
              {series.map((item) => (
                <circle
                  key={item.key}
                  cx={x}
                  cy={chartY(point[item.key], max)}
                  r="1.5"
                  className={item.fill}
                />
              ))}
              {labels.has(index) && (
                <text x={x} y="61" textAnchor="middle" className="fill-secondary-foreground text-xs">
                  {point.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {activePoint && activeIndex !== null && (
        <ChartTooltip x={chartX(activeIndex, points.length)}>
          {`${activePoint.date} · Yapılacak: ${activePoint.todo} · Yapılıyor: ${activePoint.inProgress} · Yapıldı: ${activePoint.done}`}
        </ChartTooltip>
      )}
      <ChartInteractionSurface
        testId="company-cumulative-flow-hit-surface"
        count={points.length}
        onActivate={setActiveIndex}
        onDeactivate={() => setActiveIndex(null)}
      >
        {points.map((point, index) => (
          <ChartDataPoint
            key={point.date}
            x={chartX(index, points.length)}
            top={`${(chartY(Math.max(point.todo, point.inProgress, point.done), max) / CHART_BOTTOM) * 100}%`}
            label={`${point.date}: Yapılacak: ${point.todo}, Yapılıyor: ${point.inProgress}, Yapıldı: ${point.done}`}
            onActivate={() => setActiveIndex(index)}
            onDeactivate={() => setActiveIndex(null)}
          />
        ))}
      </ChartInteractionSurface>
    </div>
  );
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
  const maxFlow = Math.max(
    1,
    ...createdVsCompleted.flatMap((point) => [point.created, point.completed]),
  );
  const maxThroughput = Math.max(1, ...throughput.map((point) => point.count));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="company-created-completed-heading"
        className="flex h-64 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 md:p-5"
      >
        <div className="mb-2 shrink-0">
          <h2 id="company-created-completed-heading" className="text-lg font-semibold">
            Oluşturulan ve tamamlanan
          </h2>
          <p className="text-sm text-secondary-foreground">Seçili dönemin akışı</p>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col"
          role="group"
          aria-label="Oluşturulan ve tamamlanan trendi"
        >
          {createdVsCompleted.length === 0 && (
            <p className="py-6 text-center text-sm text-secondary-foreground">
              Bu dönemde veri yok.
            </p>
          )}
          {createdVsCompleted.length > 0 && (
            <TrendChart
              key={`${createdVsCompleted[0]?.period}-${createdVsCompleted[createdVsCompleted.length - 1]?.period}`}
              points={createdVsCompleted}
              max={maxFlow}
            />
          )}
        </div>
        <div className="mt-2 flex shrink-0 gap-4 text-xs text-secondary-foreground">
          <span>
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary"
              aria-hidden="true"
            />
            Oluşturulan
          </span>
          <span>
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-done"
              aria-hidden="true"
            />
            Tamamlanan
          </span>
        </div>
      </section>

      <section
        aria-labelledby="company-throughput-heading"
        className="flex h-64 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 md:p-5"
      >
        <div className="mb-2 shrink-0">
          <h2 id="company-throughput-heading" className="text-lg font-semibold">
            Throughput
          </h2>
          <p className="text-sm text-secondary-foreground">Dönem başına tamamlanan görev</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col" role="group" aria-label="Throughput trendi">
          {throughput.length === 0 && (
            <p className="py-6 text-center text-sm text-secondary-foreground">
              Bu dönemde veri yok.
            </p>
          )}
          {throughput.length > 0 && (
            <ThroughputChart
              key={`${throughput[0]?.period}-${throughput[throughput.length - 1]?.period}`}
              points={throughput}
              max={maxThroughput}
            />
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
              Kümülatif akış
            </h2>
            <p className="text-sm text-secondary-foreground">Gün sonu görev durumları</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col" role="group" aria-label="Kümülatif akış trendi">
            {cumulativeFlow.samples.length === 0 && (
              <p className="py-6 text-center text-sm text-secondary-foreground">Bu dönemde veri yok.</p>
            )}
            {cumulativeFlow.samples.length > 0 && (
              <CumulativeFlowChart
                key={`${cumulativeFlow.samples[0]?.date}-${cumulativeFlow.samples[cumulativeFlow.samples.length - 1]?.date}`}
                points={cumulativeFlow.samples}
                max={Math.max(
                  1,
                  ...cumulativeFlow.samples.flatMap((point) => [point.todo, point.inProgress, point.done]),
                )}
              />
            )}
          </div>
          <div className="mt-2 flex shrink-0 gap-4 text-xs text-secondary-foreground">
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-todo" aria-hidden="true" />Yapılacak</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-inprogress" aria-hidden="true" />Yapılıyor</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-status-done" aria-hidden="true" />Yapıldı</span>
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
            Görev durumu
          </h2>
          <p className="text-sm text-secondary-foreground">Aktif görevlerin dağılımı</p>
        </div>
        <span className="text-sm text-secondary-foreground">{breakdown.total} görev</span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative h-36 w-36 shrink-0">
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
            <span className="text-2xl font-semibold tabular-nums">{breakdown.total}</span>
            <span className="text-xs text-secondary-foreground">toplam görev</span>
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
              aria-label={`${segment.label}: ${segment.value.count} görev, %${segment.value.percentage}; görevleri aç`}
            >
              <span className={`h-2.5 w-2.5 rounded-sm ${segment.marker}`} aria-hidden="true" />
              <span className="col-span-3">
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
      className="rounded-lg border border-border bg-card p-4 md:p-5"
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
        className="flex h-3 w-full overflow-hidden rounded-sm bg-secondary"
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
