import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TeamDetail } from '@/services/teams';
import type { Task } from '@/hooks/tasks';
import type { TeamDashboard as TeamDashboardData } from '@/services/companyDashboard';
import { TeamDetailPage } from './TeamDetailPage';

const mocks = vi.hoisted(() => ({
  useTeam: vi.fn(),
  useTasks: vi.fn(),
  useTeamDashboard: vi.fn(),
  useCreateTask: vi.fn(),
  useAuth: vi.fn(),
  updateTeam: vi.fn(),
}));

vi.mock('@/hooks/queries/useTeams', () => ({ useTeam: mocks.useTeam }));
vi.mock('@/hooks/tasks', () => ({
  useTasks: mocks.useTasks,
  useCreateTask: mocks.useCreateTask,
}));
vi.mock('@/hooks/queries/useTeamDashboard', () => ({
  useTeamDashboard: mocks.useTeamDashboard,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/hooks/queries/useTeamMutations', () => ({
  useUpdateTeam: () => ({ mutateAsync: mocks.updateTeam, isPending: false }),
}));
vi.mock('./MemberList', () => ({ MemberList: () => <div data-testid="team-members" /> }));
vi.mock('./AddMemberModal', () => ({ AddMemberModal: () => <button>Üye Ekle</button> }));

const team: TeamDetail = {
  id: 'team-1',
  name: 'Ürün Tasarım Ekibi',
  description: 'TaskFlow ürün deneyimini planlayan ve geliştiren ekip.',
  tenantId: 'tenant-1',
  memberCount: 2,
  createdAt: '2025-01-01T00:00:00.000Z',
  taskCount: 2,
  members: [
    {
      userId: 'user-1',
      displayId: 'AAAAA',
      fullName: 'Ayşe Yılmaz',
      avatarUrl: null,
      role: 'teamAdmin',
      joinedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      userId: 'user-2',
      displayId: 'BBBBB',
      fullName: 'Mert Kaya',
      avatarUrl: null,
      role: 'member',
      joinedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
};

const task = (id: string, status: Task['status']): Task =>
  ({
    id,
    title: `Task ${id}`,
    description: null,
    status,
    priority: 'medium',
    deadline: null,
    archivedAt: null,
    teamId: team.id,
    assignerId: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    pendingStatus: null,
    pendingVersion: 0,
    pendingProposedBy: null,
    pendingProposedAt: null,
    pendingProposer: null,
    statusAcks: [],
    team: { id: team.id, name: team.name, tenantId: team.tenantId },
    assigner: { id: 'user-1', displayId: 'AAAAA', fullName: 'Ayşe Yılmaz', avatarUrl: null },
    assignees: [],
  }) as Task;

const dashboard: TeamDashboardData = {
  period: { range: '30d', start: '2025-01-01', end: '2025-01-31' },
  createdInPeriod: { current: 0, previous: 0, delta: 0, deltaPercentage: 0 },
  completedInPeriod: { current: 0, previous: 0, delta: 0, deltaPercentage: 0 },
  cycleTime: { unit: 'days', median: 2, p85: 4, sampleSize: 2 },
  leadTime: { unit: 'days', median: 5, sampleSize: 2 },
  agingWip: {
    unit: 'days',
    buckets: { zeroToThree: 1, fourToSeven: 0, eightToFourteen: 0, fifteenToThirty: 0, overThirty: 0 },
    measuredCount: 1,
    unknownCount: 1,
    totalCount: 2,
  },
  overdueRate: { current: 0, previous: 0, delta: 0, deltaPercentage: 0 },
  onTimeDeliveryRate: { current: 0, previous: 0, delta: 0, deltaPercentage: 0 },
  backlogChange: 0,
  throughput: [],
  createdVsCompleted: [],
  scope: { teamId: team.id, teamName: team.name },
  health: {
    period: { range: '30d', start: '2025-01-01', end: '2025-01-31' },
    scope: { teamId: team.id, teamName: team.name },
    status: 'INSUFFICIENT_DATA',
    sampleSize: 1,
    minimumSampleSize: 5,
    explanation: 'Sağlık durumu için en az 5 tamamlanan görev gerekir; bu dönemde 1 görev tamamlandı.',
    insights: [
      {
        metric: 'completedTaskCount',
        observedValue: 1,
        threshold: 5,
        comparison: 'below',
        message: 'Örneklem yetersiz: 1/5 tamamlanan görev.',
        period: { range: '30d', start: '2025-01-01', end: '2025-01-31' },
        scope: { teamId: team.id, teamName: team.name },
      },
    ],
  },
  summary: {
    totalUserCount: 2,
    totalTaskCount: 2,
    openTaskCount: 1,
    completedTaskCount: 1,
    expiredTaskCount: 0,
    completionRate: 50,
  },
  risk: {
    overdueTaskCount: 0,
    dueNextSevenDaysTaskCount: 0,
    pendingApprovalTaskCount: 0,
    expiredTaskCount: 0,
  },
  riskTasks: { overdue: [], dueNextSevenDays: [], pendingApproval: [], expired: [] },
  statusBreakdown: {
    total: 2,
    todo: { count: 1, percentage: 50 },
    inProgress: { count: 0, percentage: 0 },
    done: { count: 1, percentage: 50 },
  },
  priorityBreakdown: {
    total: 1,
    low: { count: 0, percentage: 0 },
    medium: { count: 1, percentage: 100 },
    high: { count: 0, percentage: 0 },
  },
  members: {
    items: [
      {
        userId: 'user-1',
        fullName: 'Ayşe Yılmaz',
        assignedTaskCount: 1,
        openTaskCount: 1,
        completedTaskCount: 0,
        expiredTaskCount: 0,
        completionRate: 0,
      },
    ],
    totalCount: 1,
    returnedCount: 1,
    capped: false,
  },
  teams: [],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/teams/team-1']}>
        <TeamDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TeamDetailPage', () => {
  beforeEach(() => {
    mocks.useTeam.mockReturnValue({ data: team, isLoading: false, isError: false });
    mocks.useTasks.mockReturnValue({
      data: { tasks: [task('1', 'todo'), task('2', 'done')], total: 2 },
      isLoading: false,
      isError: false,
    });
    mocks.useTeamDashboard.mockReturnValue({
      data: dashboard,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mocks.useCreateTask.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' },
      isCompanyAdmin: false,
    });
    mocks.updateTeam.mockResolvedValue({ ...team, name: 'Yeni Takım' });
  });

  it('renders mirrored detail panels with factual counts', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Ürün Tasarım Ekibi' })).toBeInTheDocument();
    expect(screen.getByTestId('team-detail-panels')).toHaveClass('lg:grid-cols-2');
    expect(screen.getByRole('heading', { name: /Üyeler \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Görevler \(2\)/ })).toBeInTheDocument();
  });

  it('shows the team dashboard tab only to an admin of this team', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { name: 'Takım Dashboardu' })).toBeInTheDocument();
    expect(screen.getByText('Toplam üye')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Takım sağlığı' })).toHaveTextContent('Yetersiz veri');
    expect(screen.getByText(/en az 5 tamamlanan görev gerekir/i)).toBeInTheDocument();
    expect(screen.getByText('Median çevrim süresi')).toBeInTheDocument();
    expect(screen.getByText('Lead time')).toBeInTheDocument();
    expect(screen.getByText(/Ölçülemeyen/)).toBeInTheDocument();
    expect(screen.getByText(/Yapılacak:/)).toBeInTheDocument();
    expect(screen.getByText(/Yapıldı:/)).toBeInTheDocument();
  });

  it('replaces dashboard charts with an empty state for a team without tasks', async () => {
    const user = userEvent.setup();
    mocks.useTeamDashboard.mockReturnValueOnce({
      data: {
        ...dashboard,
        createdVsCompleted: [],
        throughput: [],
        summary: {
          ...dashboard.summary,
          totalTaskCount: 0,
          openTaskCount: 0,
          completedTaskCount: 0,
          expiredTaskCount: 0,
          completionRate: 0,
        },
        statusBreakdown: {
          total: 0,
          todo: { count: 0, percentage: 0 },
          inProgress: { count: 0, percentage: 0 },
          done: { count: 0, percentage: 0 },
        },
        priorityBreakdown: {
          total: 0,
          low: { count: 0, percentage: 0 },
          medium: { count: 0, percentage: 0 },
          high: { count: 0, percentage: 0 },
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));

    expect(screen.getByTestId('team-dashboard-empty')).toHaveTextContent(
      'Grafikler görev eklendiğinde burada görünecek.',
    );
    expect(screen.queryByTestId('company-trend-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('company-throughput-chart')).not.toBeInTheDocument();
  });

  it('hides dashboard and edit controls from a regular team member', () => {
    mocks.useAuth.mockReturnValue({
      user: { id: 'user-2', role: 'member', tenantId: 'tenant-1' },
      isCompanyAdmin: false,
    });
    renderPage();

    expect(screen.queryByRole('tab', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Takım Bilgilerini Düzenle/i })).not.toBeInTheDocument();
  });

  it('validates and saves team name and description in the edit modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Takım Bilgilerini Düzenle/i }));
    await user.clear(screen.getByLabelText(/Takım adı/));
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri Kaydet' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Takım adı en az 2 karakter olmalı.');

    await user.type(screen.getByLabelText(/Takım adı/), 'Yeni Takım');
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri Kaydet' }));
    expect(mocks.updateTeam).toHaveBeenCalledWith({
      teamId: team.id,
      name: 'Yeni Takım',
      description: team.description,
    });
  });
});
