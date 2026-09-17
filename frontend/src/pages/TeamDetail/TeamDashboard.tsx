import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { useTeamDashboard } from '@/hooks/queries/useTeamDashboard';
import type { CompanyDashboardRange } from '@/services/companyDashboard';
import { DashboardHealth } from '@/components/dashboard/DashboardHealth';
import { PeriodTrendCharts, PriorityDistribution, StatusDonut } from '../Company/CompanyDashboardCharts';
import { MemberWorkloadTable, RiskLedger } from '../Company/CompanyDashboardTables';

function KpiCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string | number;
  tooltip?: string;
}) {
  return (
    <article className="border-l border-border px-3 first:border-l-0">
      <p className="text-xs text-secondary-foreground">
        {label}
        {tooltip ? <InfoTooltip label={`${label} açıklaması`} description={tooltip} /> : null}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function InfoTooltip({ label, description }: { label: string; description: string }) {
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        title={description}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-secondary-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info aria-hidden="true" size={11} strokeWidth={2.25} />
      </button>
      {isOpen ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md"
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}

function RiskCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="border-l border-border px-4 first:border-l-0">
      <p className="text-xs text-secondary-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function formatDuration(value: number | null): string {
  return value === null ? 'Ölçüm yok' : `${value} gün`;
}

function TeamDashboardSkeleton() {
  return (
    <div data-testid="team-dashboard-skeleton" className="space-y-4" aria-busy="true">
      <div className="h-10 w-1/3 animate-pulse rounded-md bg-secondary" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg bg-secondary" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-secondary" />
    </div>
  );
}

export function TeamDashboard({ teamId, enabled }: { teamId: string; enabled: boolean }) {
  const [range, setRange] = useState<CompanyDashboardRange>('30d');
  const dashboard = useTeamDashboard(teamId, range, enabled);

  if (dashboard.isLoading) return <TeamDashboardSkeleton />;

  if (dashboard.isError || !dashboard.data) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-priority-high">Takım dashboard verisi yüklenemedi.</p>
        <button
          type="button"
          onClick={() => dashboard.refetch()}
          className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-black hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  const data = dashboard.data;
  const teamScope = data.scope.teamId ?? teamId;
  const isEmpty = data.summary.totalTaskCount === 0;

  return (
    <div
      data-testid="team-dashboard"
      role="tabpanel"
      aria-label="Dashboard"
      className="space-y-4 md:space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Takım Dashboardu</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            Takımın güncel görev ve iş yükü özeti
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="team-dashboard-range"
            className="block text-xs font-medium text-secondary-foreground"
          >
            Dönem aralığı
          </label>
          <select
            id="team-dashboard-range"
            aria-label="Dönem aralığı"
            value={range}
            onChange={(event) => setRange(event.target.value as CompanyDashboardRange)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            <option value="7d">Son 7 gün</option>
            <option value="30d">Son 30 gün</option>
            <option value="90d">Son 90 gün</option>
          </select>
        </div>
      </div>

      {dashboard.isFetching && (
        <p role="status" aria-busy="true" className="text-sm text-secondary-foreground">
          Veriler güncelleniyor…
        </p>
      )}

      <DashboardHealth health={data.health} />

      <div className="grid grid-cols-2 gap-y-4 border-y border-border bg-card/40 py-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Toplam üye" value={data.summary.totalUserCount} />
        <KpiCard label="Toplam görev" value={data.summary.totalTaskCount} />
        <KpiCard label="Açık görev" value={data.summary.openTaskCount} />
        <KpiCard label="Tamamlanan görev" value={data.summary.completedTaskCount} />
        <KpiCard label="Süresi dolan" value={data.summary.expiredTaskCount} />
        <KpiCard label="Tamamlanma oranı" value={`%${data.summary.completionRate}`} />
      </div>

      <section
        aria-labelledby="team-risk-heading"
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="grid grid-cols-2 gap-y-4 px-4 py-4 md:px-5 lg:flex lg:items-center">
          <div className="col-span-2 min-w-0 lg:col-span-1 lg:w-[28%] lg:shrink-0 lg:pr-4">
            <h2 id="team-risk-heading" className="text-lg font-semibold">
              Risk özeti
            </h2>
            <p className="mt-1 text-sm text-secondary-foreground">Bu takımın görev durumu</p>
          </div>
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-y-4 sm:grid-cols-4 lg:flex-1 lg:gap-y-0">
            <RiskCard label="Geciken görev" value={data.risk.overdueTaskCount} />
            <RiskCard label="Yedi gün içinde" value={data.risk.dueNextSevenDaysTaskCount} />
            <RiskCard label="Onay bekleyen" value={data.risk.pendingApprovalTaskCount} />
            <RiskCard label="Süresi dolan" value={data.risk.expiredTaskCount} />
            <RiskCard label="Engellenen görev" value={data.risk.blockedTaskCount ?? 0} />
            <RiskCard
              label="3 günden uzun engel"
              value={data.risk.blockedOverThreeDaysTaskCount ?? 0}
            />
            <RiskCard label="Engel oranı" value={`%${data.risk.blockedRate ?? 0}`} />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="team-flow-heading"
        data-testid="team-flow-metrics"
        className="rounded-lg border border-border bg-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4 md:px-5">
          <div>
            <h2 id="team-flow-heading" className="text-lg font-semibold">
              Akış metrikleri
            </h2>
            <p className="mt-1 text-sm text-secondary-foreground">
              Seçili dönemde tamamlanan görevler ve mevcut WIP
            </p>
          </div>
          <KpiCard label="Ölçüm örneği" value={`n=${data.cycleTime.sampleSize}`} />
        </div>
        <div className="grid grid-cols-2 gap-y-4 px-4 py-4 md:px-5 sm:grid-cols-3">
          <KpiCard
            label="Median çevrim süresi"
            value={formatDuration(data.cycleTime.median)}
            tooltip="Tamamlanan görevlerin yarısının bu süreden kısa, yarısının uzun sürdüğünü gösterir."
          />
          <KpiCard
            label="P85 çevrim süresi"
            value={formatDuration(data.cycleTime.p85)}
            tooltip="Tamamlanan görevlerin %85’inin bu sürede veya daha kısa sürede tamamlandığını gösterir."
          />
          <KpiCard
            label="Lead time"
            value={formatDuration(data.leadTime.median)}
            tooltip="Görevin oluşturulmasından tamamlanmasına kadar geçen medyan süreyi gösterir."
          />
        </div>
        <div className="border-t border-border px-4 py-4 md:px-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">
              Aging WIP
              <InfoTooltip
                label="Aging WIP açıklaması"
                description="Tamamlanmamış işlerin ne kadar süredir açık olduğunu gösterir."
              />
            </h3>
            <span className="text-xs text-secondary-foreground">
              {data.agingWip.totalCount === 0 ? 'WIP yok' : `${data.agingWip.totalCount} görev`}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['0–3 gün', data.agingWip.buckets.zeroToThree],
              ['4–7 gün', data.agingWip.buckets.fourToSeven],
              ['8–14 gün', data.agingWip.buckets.eightToFourteen],
              ['15–30 gün', data.agingWip.buckets.fifteenToThirty],
              ['30+ gün', data.agingWip.buckets.overThirty],
            ].map(([label, count]) => (
              <div key={label} className="rounded-md bg-muted/40 px-3 py-2">
                <p className="text-xs text-secondary-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-secondary-foreground">
            Ölçülemeyen (başlangıç tarihi yok): {data.agingWip.unknownCount}
            <InfoTooltip
              label="Ölçülemeyen işler açıklaması"
              description="Başlangıç tarihi olmayan WIP görevleri bu sayıya dahil edilir; yaşları ölçülemez."
            />
          </p>
        </div>
      </section>

      {isEmpty ? (
        <div
          data-testid="team-dashboard-empty"
          className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-secondary-foreground"
        >
          Bu takımda henüz görev yok. Grafikler görev eklendiğinde burada görünecek.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,.9fr)]">
            <RiskLedger risk={data.risk} riskTasks={data.riskTasks} teamId={teamScope} />
            <div className="space-y-4">
              <StatusDonut breakdown={data.statusBreakdown} teamId={teamScope} />
              <PriorityDistribution breakdown={data.priorityBreakdown} teamId={teamScope} />
            </div>
          </div>
          <PeriodTrendCharts
            createdVsCompleted={data.createdVsCompleted}
            throughput={data.throughput}
          />
        </>
      )}

      <MemberWorkloadTable members={data.members} teamId={teamScope} showDetails />
    </div>
  );
}
