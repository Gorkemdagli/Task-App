import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCalendarDateDisplay } from '@/lib/calendarDate';
import { RECORD_CAP_MESSAGE } from '@/lib/listLimits';
import type { CompanyDashboard, CompanyRiskTask } from '@/services/companyDashboard';
import { buildMemberTasksUrl, buildTeamTasksUrl } from './companyDashboardNavigation';

type Members = CompanyDashboard['members'];
type Teams = CompanyDashboard['teams'];
type Risk = CompanyDashboard['risk'];
type RiskTasks = CompanyDashboard['riskTasks'];
type RiskTab = keyof RiskTasks;

const RISK_TABS: Array<{
  key: RiskTab;
  label: string;
  countKey: keyof Risk;
  filter: string;
  includeArchived?: boolean;
  tone: string;
}> = [
  {
    key: 'overdue',
    label: 'Geciken görevler',
    countKey: 'overdueTaskCount',
    filter: 'overdue',
    tone: 'text-priority-high',
  },
  {
    key: 'dueNextSevenDays',
    label: 'Yedi gün içinde',
    countKey: 'dueNextSevenDaysTaskCount',
    filter: 'week',
    tone: 'text-priority-medium',
  },
  {
    key: 'pendingApproval',
    label: 'Onay bekleyen',
    countKey: 'pendingApprovalTaskCount',
    filter: 'all',
    tone: 'text-primary',
  },
  {
    key: 'expired',
    label: 'Süresi dolmuş',
    countKey: 'expiredTaskCount',
    filter: 'overdue',
    includeArchived: true,
    tone: 'text-secondary-foreground',
  },
];

const STATUS_LABEL: Record<CompanyRiskTask['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

const STATUS_TONE: Record<CompanyRiskTask['status'], string> = {
  todo: 'bg-secondary text-secondary-foreground',
  in_progress: 'bg-primary/15 text-primary',
  done: 'bg-status-done/15 text-status-done',
};

const PAGE_SIZE = 10;
const MEMBER_PAGE_SIZE = 4;
const TEAM_PAGE_SIZE = 3;

function initials(fullName: string) {
  return fullName
    .split(' ')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function StatusBadge({ status }: { status: CompanyRiskTask['status'] }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs ${STATUS_TONE[status]}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'todo'
            ? 'bg-status-todo'
            : status === 'in_progress'
              ? 'bg-status-inprogress'
              : 'bg-status-done'
        }`}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function RiskTaskRow({ task }: { task: CompanyRiskTask }) {
  return (
    <tr className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-3 last:border-b-0 lg:table-row lg:p-0">
      <td className="col-span-2 min-w-0 lg:table-cell lg:px-3 lg:py-3">
        <span className="mb-1 block text-xs text-secondary-foreground lg:hidden">Görev adı</span>
        <Link
          to={`/tasks/${task.id}`}
          className="block truncate rounded-sm text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {task.title}
        </Link>
      </td>
      <td className="min-w-0 lg:table-cell lg:px-3 lg:py-3">
        <span className="mb-1 block text-xs text-secondary-foreground lg:hidden">
          Proje / takım
        </span>
        <Link
          to={buildTeamTasksUrl(task.team.id)}
          className="truncate rounded-sm text-xs text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {task.team.name}
        </Link>
      </td>
      <td className="min-w-0 lg:table-cell lg:px-3 lg:py-3">
        <span className="mb-1 block text-xs text-secondary-foreground lg:hidden">Sorumlu</span>
        <div className="flex min-w-0 items-center gap-2">
          {task.assignee ? (
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground"
              aria-hidden="true"
            >
              {initials(task.assignee.fullName)}
            </span>
          ) : null}
          <span className="truncate text-xs text-foreground">
            {task.assignee?.fullName ?? 'Atanmamış'}
          </span>
        </div>
      </td>
      <td className="min-w-0 lg:table-cell lg:px-3 lg:py-3">
        <span className="mb-1 block text-xs text-secondary-foreground lg:hidden">Son tarih</span>
        <span className="text-xs font-medium text-priority-high">
          {formatCalendarDateDisplay(task.deadline)}
        </span>
      </td>
      <td className="col-span-2 lg:table-cell lg:px-3 lg:py-3">
        <span className="mb-1 block text-xs text-secondary-foreground lg:hidden">Durum</span>
        <StatusBadge status={task.status} />
      </td>
    </tr>
  );
}

export function RiskLedger({
  risk,
  riskTasks,
  teamId,
}: {
  risk: Risk;
  riskTasks: RiskTasks;
  teamId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<RiskTab>('overdue');
  const [page, setPage] = useState(1);
  const tab = RISK_TABS.find((item) => item.key === activeTab) ?? RISK_TABS[0];
  const tasks = riskTasks[tab.key];
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const visibleTasks = tasks.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const allTasksParams = new URLSearchParams();
  if (tab.filter !== 'all') allTasksParams.set('deadline', tab.filter);
  if (tab.includeArchived) allTasksParams.set('includeArchived', 'true');
  if (teamId) allTasksParams.set('teamId', teamId);

  return (
    <section
      aria-labelledby="company-risk-ledger-heading"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-col items-start justify-between gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center md:px-5">
        <div>
          <h2 id="company-risk-ledger-heading" className="text-lg font-semibold">
            Riskli görevler
          </h2>
          <p className="mt-1 text-sm text-secondary-foreground">Acil ilgi gerektiren görevler</p>
        </div>
        <Link
          to={`/tasks?${allTasksParams.toString()}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-xs font-medium text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Tümünü görüntüle
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Risk kategorileri"
        className="grid grid-cols-2 overflow-hidden border-b border-border px-2 sm:flex sm:overflow-x-auto"
      >
        {RISK_TABS.map((item) => {
          const active = item.key === activeTab;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`risk-panel-${item.key}`}
              onClick={() => {
                setActiveTab(item.key);
                setPage(1);
              }}
              className={`relative min-h-11 min-w-0 w-full px-2 py-3 text-center text-xs font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:w-auto sm:shrink-0 sm:px-3 ${
                active
                  ? `${item.tone} after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary`
                  : 'text-secondary-foreground hover:text-foreground'
              }`}
            >
              {item.label} ({risk[item.countKey]})
            </button>
          );
        })}
      </div>

      <div
        id={`risk-panel-${tab.key}`}
        role="tabpanel"
        aria-label={tab.label}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="overflow-x-hidden lg:overflow-x-auto">
          <table
            aria-label="Riskli görevler"
            className="w-full table-fixed text-left lg:table-auto"
          >
            <thead className="hidden border-b border-border bg-secondary/30 text-xs text-secondary-foreground lg:table-header-group">
              <tr>
                <th className="px-3 py-2 font-medium">Görev adı</th>
                <th className="px-3 py-2 font-medium">Proje</th>
                <th className="px-3 py-2 font-medium">Sorumlu</th>
                <th className="px-3 py-2 font-medium">Son tarih</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="block lg:table-row-group">
              {visibleTasks.map((task) => (
                <RiskTaskRow key={task.id} task={task} />
              ))}
            </tbody>
          </table>
        </div>

        {visibleTasks.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-secondary-foreground">
            Bu risk kategorisinde görev yok.
          </p>
        )}

        <nav
          aria-label="Risk sayfalama"
          className="mt-auto flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-secondary-foreground"
        >
          <span className="min-w-0 truncate">
            {tasks.length === 0
              ? '0 görev'
              : `${(visiblePage - 1) * PAGE_SIZE + 1}–${Math.min(visiblePage * PAGE_SIZE, tasks.length)} / ${tasks.length} görev`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={visiblePage === 1}
              aria-label="Önceki risk sayfası"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-8 text-center tabular-nums">{visiblePage}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={visiblePage === totalPages}
              aria-label="Sonraki risk sayfası"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      </div>
    </section>
  );
}

export function MemberWorkloadTable({
  members,
  teamId,
}: {
  members: Members;
  teamId: string | null;
}) {
  const [mobilePage, setMobilePage] = useState(1);
  const maxOpenTaskCount = Math.max(0, ...members.items.map((member) => member.openTaskCount));
  const mobileTotalPages = Math.max(1, Math.ceil(members.items.length / MEMBER_PAGE_SIZE));
  const visibleMobilePage = Math.min(mobilePage, mobileTotalPages);
  const mobileStart = (visibleMobilePage - 1) * MEMBER_PAGE_SIZE;
  const mobileEnd = mobileStart + MEMBER_PAGE_SIZE;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <h2 className="text-lg font-semibold">Üye görev yükü</h2>
        <p className="mt-1 text-sm text-secondary-foreground">Takım üyelerinin açık görevleri</p>
      </div>
      <div
        className={`overflow-hidden px-2 pb-2 ${
          members.items.length > 4 ? 'lg:max-h-64 lg:overflow-y-auto' : ''
        }`}
      >
        <table
          aria-label="Üye görev yükü"
          className="w-full table-fixed text-left text-xs sm:table-auto"
        >
          <thead className="hidden border-b border-border text-secondary-foreground sm:table-header-group">
            <tr>
              <th className="px-2 py-2 font-medium">Üye</th>
              <th className="px-2 py-2 font-medium">Açık görev</th>
              <th className="px-2 py-2 text-right font-medium">Tamamlanan</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {members.items.map((member, index) => {
              const width =
                maxOpenTaskCount === 0
                  ? 0
                  : Math.round((member.openTaskCount / maxOpenTaskCount) * 100);
              return (
                <tr
                  key={member.userId}
                  className={`${
                    index >= mobileStart && index < mobileEnd ? 'grid' : 'hidden sm:table-row'
                  } grid-cols-2 gap-x-4 gap-y-2 border-b border-border p-3 last:border-b-0 sm:table-row sm:p-0`}
                >
                  <td className="col-span-2 min-w-0 px-2 py-2.5 sm:table-cell">
                    <span className="mb-1 block text-xs text-secondary-foreground sm:hidden">
                      Üye
                    </span>
                    <Link
                      to={buildMemberTasksUrl(member.userId, teamId)}
                      className="block truncate rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`${member.fullName} görevlerini aç`}
                    >
                      {member.fullName}
                    </Link>
                    <span className="mt-0.5 block text-xs text-secondary-foreground">
                      {member.assignedTaskCount} atanan
                    </span>
                  </td>
                  <td className="min-w-0 px-2 py-2.5 sm:table-cell">
                    <span className="mb-1 block text-xs text-secondary-foreground sm:hidden">
                      Açık görev
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        to={buildMemberTasksUrl(member.userId, teamId)}
                        className="font-medium tabular-nums text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`${member.fullName}: ${member.openTaskCount} açık görev`}
                      >
                        {member.openTaskCount}
                      </Link>
                      <span
                        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-secondary"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="min-w-0 px-2 py-2.5 text-right tabular-nums sm:table-cell">
                    <span className="mb-1 block text-right text-xs text-secondary-foreground sm:hidden">
                      Tamamlanan
                    </span>
                    {member.completedTaskCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {members.items.length > MEMBER_PAGE_SIZE && (
        <nav
          aria-label="Üye sayfalama"
          className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-secondary-foreground sm:hidden"
        >
          <span className="tabular-nums" aria-live="polite">
            {visibleMobilePage} / {mobileTotalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobilePage((current) => Math.max(1, current - 1))}
              disabled={visibleMobilePage === 1}
              aria-label="Önceki üye sayfası"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setMobilePage((current) => Math.min(mobileTotalPages, current + 1))}
              disabled={visibleMobilePage === mobileTotalPages}
              aria-label="Sonraki üye sayfası"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
      {members.capped && (
        <p className="border-t border-border px-4 py-2 text-xs text-secondary-foreground">
          {RECORD_CAP_MESSAGE}
        </p>
      )}
    </section>
  );
}

export function TeamComparisonTable({ teams }: { teams: Teams }) {
  const [mobilePage, setMobilePage] = useState(1);
  const mobileTotalPages = Math.max(1, Math.ceil(teams.length / TEAM_PAGE_SIZE));
  const visibleMobilePage = Math.min(mobilePage, mobileTotalPages);
  const mobileStart = (visibleMobilePage - 1) * TEAM_PAGE_SIZE;
  const mobileEnd = mobileStart + TEAM_PAGE_SIZE;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <h2 className="text-lg font-semibold">Takım karşılaştırması</h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          Şirket kapsamındaki görev sonuçları
        </p>
      </div>
      <div
        className={`overflow-hidden px-2 pb-2 ${
          teams.length > 3 ? 'lg:max-h-52 lg:overflow-y-auto' : ''
        }`}
      >
        <table
          aria-label="Takım karşılaştırması"
          className="w-full table-fixed text-left text-xs sm:table-auto"
        >
          <thead className="hidden border-b border-border text-secondary-foreground sm:table-header-group">
            <tr>
              <th className="px-2 py-2 font-medium">Takım</th>
              <th className="px-2 py-2 font-medium">Açık</th>
              <th className="px-2 py-2 font-medium">Tamamlanan</th>
              <th className="px-2 py-2 font-medium">Süresi dolan</th>
              <th className="px-2 py-2 font-medium">Tamamlanma</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {teams.map((team, index) => (
              <tr
                key={team.teamId}
                className={`${
                  index >= mobileStart && index < mobileEnd ? 'grid' : 'hidden sm:table-row'
                } grid-cols-2 gap-x-4 gap-y-2 border-b border-border p-3 last:border-b-0 sm:table-row sm:p-0`}
              >
                <td className="col-span-2 min-w-0 px-2 py-2.5 font-medium sm:table-cell">
                  <span className="mr-1 text-xs font-normal text-secondary-foreground sm:hidden">
                    Takım:
                  </span>{' '}
                  <Link
                    to={`/teams/${team.teamId}`}
                    className="inline-flex min-h-11 items-center rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`${team.teamName} takım detayını aç`}
                  >
                    {team.teamName}
                  </Link>
                </td>
                <td className="px-2 py-2.5 tabular-nums sm:table-cell">
                  <span className="mb-1 block text-xs text-secondary-foreground sm:hidden">
                    Açık
                  </span>
                  {team.openTaskCount}
                </td>
                <td className="px-2 py-2.5 tabular-nums sm:table-cell">
                  <span className="mb-1 block text-xs text-secondary-foreground sm:hidden">
                    Tamamlanan
                  </span>
                  {team.completedTaskCount}
                </td>
                <td className="px-2 py-2.5 tabular-nums sm:table-cell">
                  <span className="mb-1 block text-xs text-secondary-foreground sm:hidden">
                    Süresi dolan
                  </span>
                  {team.expiredTaskCount}
                </td>
                <td className="px-2 py-2.5 tabular-nums sm:table-cell">
                  <span className="mb-1 block text-xs text-secondary-foreground sm:hidden">
                    Tamamlanma
                  </span>
                  %{team.completionRate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {teams.length > TEAM_PAGE_SIZE && (
        <nav
          aria-label="Takım sayfalama"
          className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-secondary-foreground sm:hidden"
        >
          <span className="tabular-nums" aria-live="polite">
            {visibleMobilePage} / {mobileTotalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobilePage((current) => Math.max(1, current - 1))}
              disabled={visibleMobilePage === 1}
              aria-label="Önceki takım sayfası"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setMobilePage((current) => Math.min(mobileTotalPages, current + 1))}
              disabled={visibleMobilePage === mobileTotalPages}
              aria-label="Sonraki takım sayfası"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
