import { useEffect, useId, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTeams } from '@/hooks/queries/useTeams';
import { useCompanyDashboard } from '@/hooks/queries/useCompanyDashboard';
import type { CompanyDashboardRange, DashboardComparison } from '@/services/companyDashboard';
import { DashboardHealth } from '@/components/dashboard/DashboardHealth';
import { PeriodTrendCharts, PriorityDistribution, StatusDonut } from './CompanyDashboardCharts';
import { MemberWorkloadTable, RiskLedger, TeamComparisonTable } from './CompanyDashboardTables';

function KpiCard({
  label,
  value,
  ariaLabel,
  comparison,
  tooltip,
}: {
  label: string;
  value: string | number;
  ariaLabel: string;
  comparison?: DashboardComparison;
  tooltip?: string;
}) {
  const { t } = useTranslation();
  return (
    <article aria-label={ariaLabel} className="border-l border-border px-3 first:border-l-0">
      <p className="text-xs text-secondary-foreground">
        {label}
        {tooltip ? (
          <InfoTooltip
            label={`${label} ${t('company.dashboard.descriptionSuffix')}`}
            description={tooltip}
          />
        ) : null}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {comparison ? (
        <p className="mt-0.5 text-[0.65rem] text-secondary-foreground">
          {t('company.dashboard.previous', comparison)}
        </p>
      ) : null}
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

function RiskCard({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string | number;
  ariaLabel: string;
}) {
  return (
    <article aria-label={ariaLabel} className="border-l border-border px-4 first:border-l-0">
      <p className="text-xs text-secondary-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

export function CompanyDashboard() {
  const { t } = useTranslation();
  const { data: teams } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [range, setRange] = useState<CompanyDashboardRange>('30d');
  const sortedTeams = useMemo(
    () =>
      [...(teams ?? [])].sort(
        (left, right) =>
          left.name.localeCompare(right.name, 'tr') || left.id.localeCompare(right.id),
      ),
    [teams],
  );
  const activeTeamId =
    selectedTeamId && sortedTeams.some((team) => team.id === selectedTeamId)
      ? selectedTeamId
      : null;
  const dashboard = useCompanyDashboard(activeTeamId, range);

  useEffect(() => {
    if (selectedTeamId && teams && !teams.some((team) => team.id === selectedTeamId)) {
      const resetId = window.setTimeout(() => setSelectedTeamId(null), 0);
      return () => window.clearTimeout(resetId);
    }
  }, [selectedTeamId, teams]);

  if (dashboard.isLoading) {
    return (
      <div data-testid="company-dashboard-skeleton" className="space-y-4" aria-busy="true">
        <div className="h-10 w-1/3 animate-pulse rounded-md bg-secondary" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-secondary" />
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-priority-high">{t('company.dashboard.error')}</p>
        <button
          type="button"
          onClick={() => dashboard.refetch()}
          className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-black hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('company.dashboard.retry')}
        </button>
      </div>
    );
  }

  const data = dashboard.data;
  const isEmpty = data.summary.totalTaskCount === 0 && data.summary.totalUserCount === 0;
  const teamId = data.scope.teamId;

  return (
    <div data-testid="company-dashboard" className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('company.dashboard.title')}</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            {t('company.dashboard.subtitle')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="space-y-2">
            <label
              htmlFor="company-range-filter"
              className="block text-xs font-medium text-secondary-foreground"
            >
              {t('company.dashboard.period')}
            </label>
            <select
              id="company-range-filter"
              aria-label={t('company.dashboard.period')}
              value={range}
              onChange={(event) => setRange(event.target.value as CompanyDashboardRange)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
            >
              <option value="7d">{t('company.dashboard.last7Days')}</option>
              <option value="30d">{t('company.dashboard.last30Days')}</option>
              <option value="90d">{t('company.dashboard.last90Days')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="company-team-filter"
              className="block text-xs font-medium text-secondary-foreground"
            >
              {t('company.dashboard.teamFilter')}
            </label>
            <select
              id="company-team-filter"
              aria-label={t('company.dashboard.teamFilter')}
              value={activeTeamId ?? 'all'}
              onChange={(event) =>
                setSelectedTeamId(event.target.value === 'all' ? null : event.target.value)
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:min-w-44"
            >
              <option value="all">{t('company.dashboard.allTeams')}</option>
              {sortedTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {dashboard.isFetching && (
        <p role="status" aria-busy="true" className="text-sm text-secondary-foreground">
          {t('company.dashboard.updating')}
        </p>
      )}

      <DashboardHealth health={data.health} />

      <div className="grid grid-cols-2 gap-y-4 rounded-lg border border-border bg-card py-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={t('company.dashboard.totalUsers')}
          value={data.summary.totalUserCount}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.totalUsers') })}
        />
        <KpiCard
          label={t('company.dashboard.totalTasks')}
          value={data.summary.totalTaskCount}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.totalTasks') })}
        />
        <KpiCard
          label={t('company.dashboard.openTasks')}
          value={data.summary.openTaskCount}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.openTasks') })}
        />
        <KpiCard
          label={t('company.dashboard.completedTasks')}
          value={data.summary.completedTaskCount}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.completedTasks') })}
        />
        <KpiCard
          label={t('company.dashboard.expired')}
          value={data.summary.expiredTaskCount}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.expired') })}
        />
        <KpiCard
          label={t('company.dashboard.completionRate')}
          value={t('company.dashboard.percent', { value: data.summary.completionRate })}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.completionRate') })}
        />
      </div>

      <div className="grid grid-cols-2 gap-y-4 rounded-lg border border-border bg-card py-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={t('company.dashboard.completedPeriod')}
          value={data.completedInPeriod.current}
          ariaLabel={t('company.dashboard.completedPeriodKpi')}
          comparison={data.completedInPeriod}
        />
        <KpiCard
          label={t('company.dashboard.createdPeriod')}
          value={data.createdInPeriod.current}
          ariaLabel={t('company.dashboard.createdPeriodKpi')}
          comparison={data.createdInPeriod}
        />
        <KpiCard
          label={t('company.dashboard.delayRate')}
          value={t('company.dashboard.percent', { value: data.overdueRate.current })}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.delayRate') })}
          comparison={data.overdueRate}
        />
        <KpiCard
          label={t('company.dashboard.onTimeDelivery')}
          value={t('company.dashboard.percent', { value: data.onTimeDeliveryRate.current })}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.onTimeDelivery') })}
          comparison={data.onTimeDeliveryRate}
        />
        <KpiCard
          label={t('company.dashboard.backlogChange')}
          value={data.backlogChange}
          ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.backlogChange') })}
        />
      </div>

      <section
        aria-labelledby="company-flow-heading"
        data-testid="company-flow-metrics"
        className="rounded-lg border border-border bg-card"
      >
        <div className="border-b border-border px-4 py-4 md:px-5">
          <h2 id="company-flow-heading" className="text-lg font-semibold">
            {t('company.dashboard.flowMetrics')}
          </h2>
          <p className="mt-1 text-sm text-secondary-foreground">
            {t('company.dashboard.cycleTimeDescription')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-y-4 px-4 py-4 md:px-5 sm:grid-cols-3">
          <KpiCard
            label={t('company.dashboard.medianCycleTime')}
            value={data.cycleTime.median === null
              ? t('company.dashboard.noMeasurement')
              : t('company.dashboard.days', { count: data.cycleTime.median })}
            ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.medianCycleTime') })}
            tooltip={t('company.dashboard.medianCycleTimeTooltip')}
          />
          <KpiCard
            label={t('company.dashboard.p85CycleTime')}
            value={data.cycleTime.p85 === null
              ? t('company.dashboard.noMeasurement')
              : t('company.dashboard.days', { count: data.cycleTime.p85 })}
            ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.p85CycleTime') })}
            tooltip={t('company.dashboard.p85CycleTimeTooltip')}
          />
          <KpiCard
            label={t('company.dashboard.sampleSize')}
            value={`n=${data.cycleTime.sampleSize}`}
            ariaLabel={t('company.dashboard.kpi', { label: t('company.dashboard.cycleSamples') })}
          />
        </div>
      </section>

      <PeriodTrendCharts
        createdVsCompleted={data.createdVsCompleted}
        throughput={data.throughput}
        cumulativeFlow={data.cumulativeFlow}
      />

      <section
        aria-labelledby="company-risk-heading"
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="grid grid-cols-2 gap-y-4 px-4 py-4 md:px-5 lg:flex lg:min-w-[680px] lg:items-center">
          <div className="col-span-2 min-w-0 lg:col-span-1 lg:w-[28%] lg:shrink-0 lg:pr-4">
            <h2 id="company-risk-heading" className="text-lg font-semibold">
              {t('company.dashboard.riskSummary')}
            </h2>
            <p className="mt-1 text-sm text-secondary-foreground">
              {t('company.dashboard.allTeamsStatus')}
            </p>
          </div>
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-y-4 sm:grid-cols-4 lg:flex-1 lg:gap-y-0">
            <RiskCard
              label={t('company.dashboard.overdue')}
              value={data.risk.overdueTaskCount}
              ariaLabel={t('company.dashboard.overdueRisk')}
            />
            <RiskCard
              label={t('company.dashboard.dueWithinSevenDays')}
              value={data.risk.dueNextSevenDaysTaskCount}
              ariaLabel={t('company.dashboard.dueSevenDaysRisk')}
            />
            <RiskCard
              label={t('company.dashboard.pendingApproval')}
              value={data.risk.pendingApprovalTaskCount}
              ariaLabel={t('company.dashboard.pendingApprovalRisk')}
            />
            <RiskCard
              label={t('company.dashboard.expired')}
              value={data.risk.expiredTaskCount}
              ariaLabel={t('company.dashboard.expiredRisk')}
            />
            <RiskCard
              label={t('company.dashboard.blocked')}
              value={data.risk.blockedTaskCount ?? 0}
              ariaLabel={t('company.dashboard.blockedRisk')}
            />
            <RiskCard
              label={t('company.dashboard.blockedOverThreeDays')}
              value={data.risk.blockedOverThreeDaysTaskCount ?? 0}
              ariaLabel={t('company.dashboard.blockedLongRisk')}
            />
            <RiskCard
              label={t('company.dashboard.blockedRate')}
              value={t('company.dashboard.percent', { value: data.risk.blockedRate ?? 0 })}
              ariaLabel={t('company.dashboard.blockedRate')}
            />
          </div>
        </div>
      </section>

      {isEmpty && (
        <div
          data-testid="company-dashboard-empty"
          className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-secondary-foreground"
        >
          {t('company.dashboard.noData')}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,.9fr)]">
        <RiskLedger risk={data.risk} riskTasks={data.riskTasks} teamId={teamId} />
        <div className="space-y-4">
          <StatusDonut breakdown={data.statusBreakdown} teamId={teamId} />
          <MemberWorkloadTable members={data.members} teamId={teamId} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PriorityDistribution breakdown={data.priorityBreakdown} teamId={teamId} />
        {teamId === null && <TeamComparisonTable teams={data.teams} />}
      </div>
    </div>
  );
}
