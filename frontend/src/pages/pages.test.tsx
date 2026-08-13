import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { DashboardPage } from './Dashboard';
import { TeamsPage } from './Teams';
import { TeamDetailPage } from './TeamDetail';
import { TasksPage } from './Tasks';
import { TaskDetailPage } from './TaskDetail';
import { ChatPage } from './Chat';
import { ProfilePage } from './Profile';
import { PermissionsPage } from './Permissions';
import { CompanySettingsPage } from './CompanySettings';

const { useTasksMock } = vi.hoisted(() => ({
  useTasksMock: vi.fn(() => ({ data: { tasks: [], total: 0 }, isLoading: false, isError: false })),
}));

// FAZ-4: Teams/TeamDetail fetch via React Query. Stub the hooks so this
// pages-level test focuses on title/render smoke rather than API contract.
// FAZ-5: tasks/comments hooks da stub'lanır — fixture data.
vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: [], isLoading: false, isError: false }),
  useTeam: () => ({ data: null, isLoading: true, isError: false }),
}));

vi.mock('@/hooks/tasks', async (importOriginal) => {
  // vitest: `importOriginal` defaults to `Promise<unknown>`, so `...actual`
  // fails to spread. Provide the module type explicitly. Inline `import()`
  // type is used instead of a top-level `import type` because vi.mock is
  // hoisted above regular imports and would create a circular dependency.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@/hooks/tasks')>();
  return {
    ...actual,
    useTasks: useTasksMock,
    useTask: () => ({
      data: {
        id: 't-99',
        title: 'Stub Title',
        description: null,
        status: 'todo',
        priority: 'high',
        deadline: null,
        archivedAt: null,
        teamId: 'team-1',
        assignerId: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingStatus: null,
        pendingProposedBy: null,
        pendingProposedAt: null,
        pendingProposer: null,
        statusAcks: [],
        team: { id: 'team-1', name: 'UX', tenantId: 't1' },
        assigner: { id: '1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
        assignees: [
          {
            userId: '1',
            assignedAt: new Date().toISOString(),
            user: { id: '1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
          },
        ],
      },
      isLoading: false,
      isError: false,
    }),
    useTaskComments: () => ({ data: { comments: [] }, isLoading: false, isError: false }),
    useUpdateTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useProposeTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useAckTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCancelTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useUpdateTaskPriority: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useUpdateTaskFields: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useDeleteTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCreateComment: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCreateTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useTriggerArchive: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  };
});

const member: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada',
  role: 'member',
  tenantId: 't1',
  tenantName: 'Acme A.Ş.',
};

const admin: AuthUser = { ...member, role: 'companyAdmin' };

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[path]}
      >
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:id" element={<TeamDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/company/settings" element={<CompanySettingsPage />} />
          <Route path="*" element={<div>404</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('placeholder pages', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
    useTasksMock.mockClear();
    useTasksMock.mockReturnValue({
      data: { tasks: [], total: 0 },
      isLoading: false,
      isError: false,
    });
  });

  it('Dashboard renders', () => {
    renderAt('/dashboard');
    // Stub: no teams → fallback "Kanban"
    expect(screen.getByText('Kanban')).toBeInTheDocument();
  });

  it('Teams renders title', () => {
    renderAt('/teams');
    expect(screen.getByRole('heading', { name: 'Takımlar' })).toBeInTheDocument();
  });

  it('TeamDetail renders skeleton (data still loading)', () => {
    renderAt('/teams/abc-123');
    // Stub returns loading, so no heading from team name yet — just skeleton.
    expect(document.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('Tasks renders title', () => {
    renderAt('/tasks');
    expect(screen.getByRole('heading', { name: 'Görevlerim' })).toBeInTheDocument();
  });

  it('maps task page two to a twenty-item offset and renders total pages', () => {
    useTasksMock.mockReturnValue({
      data: { tasks: [], total: 45 },
      isLoading: false,
      isError: false,
    });

    renderAt('/tasks?page=2');

    expect(useTasksMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 20 }));
    expect(screen.getByRole('button', { name: 'Sayfa 3' })).toBeInTheDocument();
  });

  it('TaskDetail renders fixture task title', () => {
    renderAt('/tasks/t-99');
    expect(screen.getByText('Stub Title')).toBeInTheDocument();
  });

  it('Chat renders title and shows id param', () => {
    renderAt('/chat/c-7');
    expect(screen.getByRole('heading', { name: 'Mesajlaşma' })).toBeInTheDocument();
    expect(screen.getByText('c-7')).toBeInTheDocument();
  });

  it('Profile renders title and shows current user email', () => {
    renderAt('/profile');
    expect(screen.getByRole('heading', { name: 'Profil' })).toBeInTheDocument();
    expect(screen.getByText('a@x.com')).toBeInTheDocument();
  });
});

describe('role-guarded pages', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
  });

  it('Permissions redirects member to /dashboard', () => {
    renderAt('/permissions');
    expect(screen.queryByRole('heading', { name: 'Yetkiler' })).not.toBeInTheDocument();
  });

  it('CompanySettings redirects member to /dashboard', () => {
    renderAt('/company/settings');
    expect(screen.queryByRole('heading', { name: 'Şirket Ayarları' })).not.toBeInTheDocument();
  });

  it('Permissions renders for companyAdmin', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderAt('/permissions');
    expect(screen.getByRole('heading', { name: 'Yetkiler' })).toBeInTheDocument();
  });

  it('CompanySettings renders for companyAdmin', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderAt('/company/settings');
    expect(screen.getByRole('heading', { name: 'Şirket Ayarları' })).toBeInTheDocument();
  });
});
