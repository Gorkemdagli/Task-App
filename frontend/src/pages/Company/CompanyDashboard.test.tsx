import { render, screen, waitFor } from '@testing-library/react';
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
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
    expect(screen.getByRole('link', { name: 'Alpha takım görevlerini aç' })).toHaveAttribute(
      'href',
      '/tasks?teamId=team-a',
    );
  });
});
