import { useEffect, useMemo, useState } from 'react';
import { useTeams } from '@/hooks/queries/useTeams';
import { useCompanyDashboard } from '@/hooks/queries/useCompanyDashboard';
import { PriorityDistribution, StatusDonut } from './CompanyDashboardCharts';
import { MemberWorkloadTable, TeamComparisonTable } from './CompanyDashboardTables';

function KpiCard({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string | number;
  ariaLabel: string;
}) {
  return (
    <article aria-label={ariaLabel} className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-secondary-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}

function RiskCard({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: number;
  ariaLabel: string;
}) {
  return (
    <article aria-label={ariaLabel} className="rounded-lg border border-border bg-card/60 p-4">
      <p className="text-xs text-secondary-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </article>
  );
}

export function CompanyDashboard() {
  const { data: teams } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
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
  const dashboard = useCompanyDashboard(activeTeamId);

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
        <p className="text-sm text-priority-high">Şirket dashboard verisi yüklenemedi.</p>
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
  const isEmpty = data.summary.totalTaskCount === 0 && data.summary.totalUserCount === 0;
  const teamId = data.scope.teamId;

  return (
    <div data-testid="company-dashboard" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Şirket Dashboardu</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            Şirket operasyonlarının güncel özeti
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="company-team-filter"
            className="block text-xs font-medium text-secondary-foreground"
          >
            Takım filtresi
          </label>
          <select
            id="company-team-filter"
            aria-label="Takım filtresi"
            value={activeTeamId ?? 'all'}
            onChange={(event) =>
              setSelectedTeamId(event.target.value === 'all' ? null : event.target.value)
            }
            className="h-10 min-w-44 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tümü</option>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dashboard.isFetching && (
        <p role="status" aria-busy="true" className="text-sm text-secondary-foreground">
          Veriler güncelleniyor…
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Toplam kullanıcı"
          value={data.summary.totalUserCount}
          ariaLabel="Toplam kullanıcı KPI"
        />
        <KpiCard
          label="Toplam görev"
          value={data.summary.totalTaskCount}
          ariaLabel="Toplam görev KPI"
        />
        <KpiCard label="Açık görev" value={data.summary.openTaskCount} ariaLabel="Açık görev KPI" />
        <KpiCard
          label="Tamamlanan görev"
          value={data.summary.completedTaskCount}
          ariaLabel="Tamamlanan görev KPI"
        />
        <KpiCard
          label="Süresi dolan"
          value={data.summary.expiredTaskCount}
          ariaLabel="Süresi dolan KPI"
        />
        <KpiCard
          label="Tamamlanma oranı"
          value={`%${data.summary.completionRate}`}
          ariaLabel="Tamamlanma oranı KPI"
        />
      </div>

      <section aria-labelledby="company-risk-heading">
        <h2 id="company-risk-heading" className="mb-3 text-lg font-semibold">
          Risk özeti
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RiskCard
            label="Geciken görev"
            value={data.risk.overdueTaskCount}
            ariaLabel="Geciken görev riski"
          />
          <RiskCard
            label="Yedi gün içinde"
            value={data.risk.dueNextSevenDaysTaskCount}
            ariaLabel="Yedi gün içinde riski"
          />
          <RiskCard
            label="Onay bekleyen"
            value={data.risk.pendingApprovalTaskCount}
            ariaLabel="Onay bekleyen risk"
          />
          <RiskCard
            label="Süresi dolan"
            value={data.risk.expiredTaskCount}
            ariaLabel="Süresi dolan risk"
          />
        </div>
      </section>

      {isEmpty && (
        <div
          data-testid="company-dashboard-empty"
          className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-secondary-foreground"
        >
          Bu kapsamda veri yok.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <StatusDonut breakdown={data.statusBreakdown} teamId={teamId} />
        <PriorityDistribution breakdown={data.priorityBreakdown} teamId={teamId} />
      </div>

      <MemberWorkloadTable members={data.members} teamId={teamId} />
      {teamId === null && <TeamComparisonTable teams={data.teams} />}
    </div>
  );
}
