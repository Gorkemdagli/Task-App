import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORD_CAP_MESSAGE } from '@/lib/listLimits';
import type { CompanyDashboard as CompanyDashboardData } from '@/services/companyDashboard';
import { CompanyDashboard } from './CompanyDashboard';

const mocks = vi.hoisted(() => ({
  useTeams: vi.fn(),
  useCompanyDashboard: vi.fn(),
}));

vi.mock('@/hooks/queries/useTeams', () => ({ useTeams: mocks.useTeams }));
vi.mock('@/hooks/queries/useCompanyDashboard', () => ({
  useCompanyDashboard: mocks.useCompanyDashboard,
}));

const teams = [
  { id: 'team-z', name: 'Zeta' },
  { id: 'team-a', name: 'Alpha' },
];

const allDashboard: CompanyDashboardData = {
  scope: { teamId: null, teamName: null },
  summary: {
    totalUserCount: 103,
    totalTaskCount: 20,
    openTaskCount: 13,
    completedTaskCount: 5,
    expiredTaskCount: 4,
    completionRate: 25,
  },
  risk: {
    overdueTaskCount: 2,
    dueNextSevenDaysTaskCount: 3,
    pendingApprovalTaskCount: 1,
    expiredTaskCount: 4,
  },
  riskTasks: {
    overdue: [
      {
        id: 'task-overdue',
        title: 'Veri yedekleme prosedürünün güncellenmesi',
        team: { id: 'team-a', name: 'BT Altyapı' },
        assignee: { id: 'user-a', fullName: 'Ada Member' },
        deadline: '2026-08-19',
        status: 'in_progress',
      },
    ],
    dueNextSevenDays: [],
    pendingApproval: [],
    expired: [],
  },
  statusBreakdown: {
    total: 20,
    todo: { count: 7, percentage: 35 },
    inProgress: { count: 8, percentage: 40 },
    done: { count: 5, percentage: 25 },
  },
  priorityBreakdown: {
    total: 20,
    low: { count: 10, percentage: 50 },
    medium: { count: 5, percentage: 25 },
    high: { count: 5, percentage: 25 },
  },
  members: {
    items: [
      {
        userId: 'user-a',
        fullName: 'Ada Member',
        assignedTaskCount: 4,
        openTaskCount: 3,
        completedTaskCount: 1,
        expiredTaskCount: 0,
        completionRate: 25,
      },
      {
        userId: 'user-zero',
        fullName: 'Sıfır Görevli',
        assignedTaskCount: 0,
        openTaskCount: 0,
        completedTaskCount: 0,
        expiredTaskCount: 0,
        completionRate: 0,
      },
    ],
    totalCount: 103,
    returnedCount: 100,
    capped: true,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Alpha',
      totalTaskCount: 10,
      openTaskCount: 6,
      completedTaskCount: 3,
      expiredTaskCount: 1,
      completionRate: 30,
    },
  ],
};

const teamDashboard: CompanyDashboardData = {
  ...allDashboard,
  scope: { teamId: 'team-a', teamName: 'Alpha' },
  members: { ...allDashboard.members, totalCount: 2, returnedCount: 2, capped: false },
  teams: [],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <CompanyDashboard />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('CompanyDashboard', () => {
  beforeEach(() => {
    mocks.useTeams.mockReset();
    mocks.useCompanyDashboard.mockReset();
    mocks.useTeams.mockReturnValue({ data: teams, isLoading: false, isError: false });
    mocks.useCompanyDashboard.mockReturnValue({
      data: allDashboard,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('sorts teams in Turkish order and changes dashboard scope', async () => {
    const user = userEvent.setup();
    mocks.useCompanyDashboard.mockImplementation((teamId: string | null) => ({
      data: teamId ? teamDashboard : allDashboard,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }));
    renderDashboard();

    const filter = screen.getByRole('combobox', { name: 'Takım filtresi' });
    expect(filter).toHaveValue('all');
    expect([...filter.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Tümü',
      'Alpha',
      'Zeta',
    ]);
    expect(screen.getByRole('table', { name: 'Takım karşılaştırması' })).toBeInTheDocument();

    await user.selectOptions(filter, 'team-a');
    expect(mocks.useCompanyDashboard).toHaveBeenLastCalledWith('team-a');
    expect(screen.queryByRole('table', { name: 'Takım karşılaştırması' })).not.toBeInTheDocument();
  });

  it('resets removed selected team to all', async () => {
    const user = userEvent.setup();
    const view = renderDashboard();
    const filter = screen.getByRole('combobox', { name: 'Takım filtresi' });
    await user.selectOptions(filter, 'team-a');
    mocks.useTeams.mockReturnValue({ data: [teams[0]], isLoading: false, isError: false });
    view.rerender(
      <MemoryRouter>
        <CompanyDashboard />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Takım filtresi' })).toHaveValue('all'),
    );
    expect(mocks.useCompanyDashboard).toHaveBeenLastCalledWith(null);
  });

  it('renders loading, retry, empty, and stale-scope states', async () => {
    mocks.useCompanyDashboard.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    });
    const loadingView = renderDashboard();
    expect(screen.getByTestId('company-dashboard-skeleton')).toBeInTheDocument();
    loadingView.unmount();

    const refetch = vi.fn();
    mocks.useCompanyDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch,
    });
    const errorView = renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent('Şirket dashboard verisi yüklenemedi.');
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(refetch).toHaveBeenCalledOnce();
    errorView.unmount();

    mocks.useCompanyDashboard.mockReturnValue({
      data: {
        ...allDashboard,
        summary: { ...allDashboard.summary, totalUserCount: 0, totalTaskCount: 0 },
        members: { ...allDashboard.members, items: [], totalCount: 0, returnedCount: 0 },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    const emptyView = renderDashboard();
    expect(screen.getByTestId('company-dashboard-empty')).toHaveTextContent(
      'Bu kapsamda veri yok.',
    );
    emptyView.unmount();

    mocks.useCompanyDashboard.mockReturnValue({
      data: allDashboard,
      isLoading: false,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderDashboard();
    expect(screen.getByText('Veriler güncelleniyor…')).toBeInTheDocument();
  });

  it('renders metrics, text-labelled charts, capped members, and accessible drill-downs', () => {
    renderDashboard();

    expect(screen.getByRole('article', { name: 'Toplam kullanıcı KPI' })).toHaveTextContent('103');
    expect(screen.getByRole('article', { name: 'Süresi dolan KPI' })).toHaveTextContent('4');
    expect(screen.getByRole('article', { name: 'Tamamlanma oranı KPI' })).toHaveTextContent('%25');
    expect(screen.getByRole('article', { name: 'Onay bekleyen risk' })).toHaveTextContent('1');
    expect(screen.getByText('Yapılıyor: 8 görev, %40')).toBeInTheDocument();
    expect(screen.getByText('Yüksek: 5 görev, %25')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Üye görev yükü' })).toHaveTextContent(
      'Sıfır Görevli',
    );
    expect(screen.getByText(RECORD_CAP_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText('Ada Member: 3 açık görev')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Onay bekleyen/ })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Yapılıyor: 8 görev/ })).toHaveAttribute(
      'href',
      '/tasks?status=in_progress',
    );
    expect(screen.getByRole('link', { name: /Yüksek: 5 görev/ })).toHaveAttribute(
      'href',
      '/tasks?status=todo%2Cin_progress&priority=high',
    );
    expect(screen.getByRole('link', { name: 'Ada Member görevlerini aç' })).toHaveAttribute(
      'href',
      '/tasks?assigneeIds=user-a',
    );
    expect(screen.getByRole('link', { name: 'Alpha takım detayını aç' })).toHaveAttribute(
      'href',
      '/teams/team-a',
    );
  });

  it('uses a mobile two-by-two team comparison grid with an inline team label', () => {
    renderDashboard();

    const teamTable = screen.getByRole('table', { name: 'Takım karşılaştırması' });
    expect(within(teamTable).getByText('Takım:')).toHaveClass('sm:hidden');
    expect(within(teamTable).getByText('%30').closest('td')).not.toHaveClass('col-span-2');
  });

  it('renders the risk ledger with task links and category tabs', () => {
    renderDashboard();

    expect(screen.getByRole('tab', { name: 'Geciken görevler (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Risk kategorileri' })).toHaveClass('grid-cols-2');
    expect(screen.getByRole('tablist', { name: 'Risk kategorileri' })).not.toHaveClass(
      'overflow-x-auto',
    );
    expect(screen.getByRole('table', { name: 'Riskli görevler' })).toHaveTextContent(
      'Veri yedekleme prosedürünün güncellenmesi',
    );
    expect(
      screen.getByRole('link', { name: 'Veri yedekleme prosedürünün güncellenmesi' }),
    ).toHaveAttribute('href', '/tasks/task-overdue');

    const riskLedger = screen.getByRole('region', { name: 'Riskli görevler' });
    const riskPanel = within(riskLedger).getByRole('tabpanel', { name: 'Geciken görevler' });
    const pagination = within(riskPanel).getByRole('navigation', { name: 'Risk sayfalama' });
    expect(riskPanel.lastElementChild).toBe(pagination);
  });

  it('links expired risk tasks to the archived task view', async () => {
    const user = userEvent.setup();
    mocks.useCompanyDashboard.mockReturnValue({
      data: {
        ...allDashboard,
        riskTasks: { ...allDashboard.riskTasks, expired: allDashboard.riskTasks.overdue },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderDashboard();

    await user.click(screen.getByRole('tab', { name: 'Süresi dolmuş (4)' }));

    expect(screen.getByRole('link', { name: 'Tümünü görüntüle' })).toHaveAttribute(
      'href',
      '/tasks?deadline=overdue&includeArchived=true',
    );
  });

  it('paginates mobile member workload by four and aligns completed counts', async () => {
    const user = userEvent.setup();
    const manyMembers = Array.from({ length: 5 }, (_, index) => ({
      ...allDashboard.members.items[0],
      userId: `user-${index}`,
      fullName: `Member ${index + 1}`,
    }));
    mocks.useCompanyDashboard.mockReturnValue({
      data: {
        ...allDashboard,
        members: { ...allDashboard.members, items: manyMembers, totalCount: 5, returnedCount: 5 },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderDashboard();

    const memberTable = screen.getByRole('table', { name: 'Üye görev yükü' });
    expect(within(memberTable).getAllByText('Tamamlanan', { selector: 'span' })[0]).toHaveClass(
      'text-right',
    );
    expect(screen.getByRole('navigation', { name: 'Üye sayfalama' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Member 1 görevlerini aç' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Member 5 görevlerini aç' }).closest('tr')).toHaveClass(
      'hidden',
    );

    await user.click(screen.getByRole('button', { name: 'Sonraki üye sayfası' }));

    expect(screen.getByRole('link', { name: 'Member 1 görevlerini aç' }).closest('tr')).toHaveClass(
      'hidden',
    );
    expect(
      screen.getByRole('link', { name: 'Member 5 görevlerini aç' }).closest('tr'),
    ).not.toHaveClass('hidden');
  });

  it('paginates mobile team comparison by three', async () => {
    const user = userEvent.setup();
    const manyTeams = Array.from({ length: 4 }, (_, index) => ({
      ...allDashboard.teams[0],
      teamId: `team-${index}`,
      teamName: `Team ${index + 1}`,
    }));
    mocks.useCompanyDashboard.mockReturnValue({
      data: { ...allDashboard, teams: manyTeams },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderDashboard();

    expect(screen.getByRole('navigation', { name: 'Takım sayfalama' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Team 4 takım detayını aç' }).closest('tr'),
    ).toHaveClass('hidden');

    await user.click(screen.getByRole('button', { name: 'Sonraki takım sayfası' }));

    expect(
      screen.getByRole('link', { name: 'Team 1 takım detayını aç' }).closest('tr'),
    ).toHaveClass('hidden');
    expect(
      screen.getByRole('link', { name: 'Team 4 takım detayını aç' }).closest('tr'),
    ).not.toHaveClass('hidden');
  });

  it('adds desktop-only inner scroll when member or team lists exceed their limits', () => {
    const baseView = renderDashboard();
    expect(screen.getByRole('table', { name: 'Üye görev yükü' }).parentElement).not.toHaveClass(
      'lg:max-h-64',
      'lg:overflow-y-auto',
    );
    expect(
      screen.getByRole('table', { name: 'Takım karşılaştırması' }).parentElement,
    ).not.toHaveClass('lg:max-h-64', 'lg:overflow-y-auto');
    baseView.unmount();

    const manyMembers = Array.from({ length: 5 }, (_, index) => ({
      ...allDashboard.members.items[0],
      userId: `user-${index}`,
      fullName: `Member ${index + 1}`,
    }));
    const manyTeams = Array.from({ length: 4 }, (_, index) => ({
      ...allDashboard.teams[0],
      teamId: `team-${index}`,
      teamName: `Team ${index + 1}`,
    }));
    mocks.useCompanyDashboard.mockReturnValue({
      data: {
        ...allDashboard,
        members: { ...allDashboard.members, items: manyMembers, totalCount: 5, returnedCount: 5 },
        teams: manyTeams,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderDashboard();

    expect(screen.getByRole('table', { name: 'Üye görev yükü' }).parentElement).toHaveClass(
      'lg:max-h-64',
      'lg:overflow-y-auto',
    );
    expect(screen.getByRole('table', { name: 'Takım karşılaştırması' }).parentElement).toHaveClass(
      'lg:max-h-52',
      'lg:overflow-y-auto',
    );
  });
});
