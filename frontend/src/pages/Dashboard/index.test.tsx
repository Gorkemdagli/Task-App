import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { DashboardPage } from './index';
import type { Task } from '@/hooks/tasks';

const { useDroppableMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useDroppable: useDroppableMock };
});

// Hook stub'ları: drag-drop simülasyonu yapmadan sayfa seviyesinde
// render/role/branch davranışını doğrulamak için.
const mocks = {
  useUpdateTaskStatus: vi.fn(),
  useProposeTaskStatus: vi.fn(),
};
void mocks; // referans korunsun (gelecek drag-drop testleri için yer tutucu)

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: mockTeams, isLoading: false, isError: false }),
  useTeam: () => ({ data: mockTeamDetail, isLoading: false, isError: false }),
}));

vi.mock('@/hooks/tasks', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useTasks: () => ({
      data: { tasks: mockTasks, total: mockTasks.length },
      isLoading: false,
      isError: false,
    }),
    useUpdateTaskStatus: () => ({
      mutate: mocks.useUpdateTaskStatus,
      mutateAsync: mocks.useUpdateTaskStatus,
    }),
    useProposeTaskStatus: () => ({
      mutate: mocks.useProposeTaskStatus,
      mutateAsync: mocks.useProposeTaskStatus,
    }),
    useUpdateTaskPriority: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useUpdateTaskFields: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useDeleteTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useAckTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCancelTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCreateTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCreateComment: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useTriggerArchive: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  };
});

const member: AuthUser = {
  id: 'u1',
  displayId: 'AAAAA',
  email: 'a@x.com',
  fullName: 'Ada',
  role: 'member',
  tenantId: 't1',
  tenantName: 'Acme A.Ş.',
};

const admin: AuthUser = { ...member, role: 'companyAdmin' };

let mockTeams: Array<{ id: string; name: string }> = [];
let mockTeamDetail: {
  id: string;
  name: string;
  members: Array<{
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    role: 'member' | 'teamAdmin';
  }>;
} | null = null;

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Test task',
    description: null,
    status: 'todo',
    priority: 'medium',
    deadline: null,
    archivedAt: null,
    teamId: 'team-1',
    assignerId: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pendingStatus: null,
    pendingVersion: 0,
    pendingProposedBy: null,
    pendingProposedAt: null,
    pendingProposer: null,
    statusAcks: [],
    team: { id: 'team-1', name: 'UX', tenantId: 't1' },
    assigner: { id: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
    assignees: [
      {
        userId: 'u1',
        assignedAt: new Date().toISOString(),
        user: { id: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
      },
    ],
    ...overrides,
  };
}

let mockTasks: Task[] = [];

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeams = [{ id: 'team-1', name: 'UX' }];
    mockTeamDetail = {
      id: 'team-1',
      name: 'UX',
      members: [{ userId: 'u1', fullName: 'Ada', avatarUrl: null, role: 'member' }],
    };
    mockTasks = [];
  });

  it('renders three status columns', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderDashboard();
    expect(screen.getByTestId('column-todo')).toBeInTheDocument();
    expect(screen.getByTestId('column-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('column-done')).toBeInTheDocument();
    expect(screen.getByText('Yapılacak')).toBeInTheDocument();
    expect(screen.getByText('Yapılıyor')).toBeInTheDocument();
    expect(screen.getByText('Yapıldı')).toBeInTheDocument();
  });

  it('registers each status column as a drop target', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderDashboard();
    const calls = useDroppableMock.mock.calls as unknown as Array<[{ id: string }]>;
    expect(calls.map(([args]) => args)).toEqual([
      { id: 'todo' },
      { id: 'in_progress' },
      { id: 'done' },
    ]);
  });

  it('shows selected team name as heading', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'UX' })).toBeInTheDocument();
  });

  it('falls back to "Kanban" when no team selected', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTeams = [];
    mockTeamDetail = null;
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Kanban' })).toBeInTheDocument();
  });

  it('shows task count', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [makeTask({ id: 't1' }), makeTask({ id: 't2', status: 'in_progress' })];
    renderDashboard();
    expect(screen.getByText('2 görev')).toBeInTheDocument();
  });

  it('shows "+ Görev Ekle" button for companyAdmin', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderDashboard();
    expect(screen.getByTestId('add-task-button')).toBeInTheDocument();
  });

  it('shows "+ Görev Ekle" button for team admin membership', () => {
    mockTeamDetail = {
      ...mockTeamDetail!,
      members: [{ userId: 'u1', fullName: 'Ada', avatarUrl: null, role: 'teamAdmin' }],
    };
    useAuthStore.setState({ accessToken: 't', user: member });
    renderDashboard();
    expect(screen.getByTestId('add-task-button')).toBeInTheDocument();
  });

  it('hides "+ Görev Ekle" button for member', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    renderDashboard();
    expect(screen.queryByTestId('add-task-button')).toBeNull();
  });

  it('renders TaskCard for each task in correct column', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [
      makeTask({ id: 't1', status: 'todo' }),
      makeTask({ id: 't2', status: 'in_progress' }),
      makeTask({ id: 't3', status: 'done' }),
    ];
    renderDashboard();
    expect(screen.getByTestId('task-card-t1')).toBeInTheDocument();
    expect(screen.getByTestId('task-card-t2')).toBeInTheDocument();
    expect(screen.getByTestId('task-card-t3')).toBeInTheDocument();
  });

  it('shows empty placeholder when column has no tasks', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [];
    renderDashboard();
    expect(screen.getAllByText('Boş').length).toBe(3);
  });

  it('shows pending badge on task with pendingStatus when viewer is not proposer', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [
      makeTask({
        id: 't1',
        pendingStatus: 'in_progress',
        // Proposer u2 (Selin), admin viewer = u1 → non-proposer viewer.
        pendingProposer: { id: 'u2', displayId: 'BBBBB', fullName: 'Selin', avatarUrl: null },
      }),
    ];
    renderDashboard();
    const card = screen.getByTestId('task-card-t1');
    expect(card.getAttribute('data-pending')).toBe('true');
    expect(card.textContent).toMatch(/Onay Bekliyor|Yapılıyor/);
  });

  it("places proposer's pending task in the new (pending) column", () => {
    // Requester kendi drag'i sonrası yeni kolonu görür.
    // Admin user 'u1' (proposer değil) değil; member 'u1' (proposer).
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTasks = [
      makeTask({
        id: 't1',
        status: 'todo',
        pendingStatus: 'in_progress',
        pendingProposer: { id: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
      }),
    ];
    renderDashboard();
    // Card in_progress kolonunda görünmeli (displayStatus = pendingStatus).
    const inProgressCol = screen.getByTestId('column-in_progress');
    expect(inProgressCol.querySelector('[data-testid="task-card-t1"]')).toBeInTheDocument();
    // todo kolonunda olmamalı.
    const todoCol = screen.getByTestId('column-todo');
    expect(todoCol.querySelector('[data-testid="task-card-t1"]')).toBeNull();
  });

  it('keeps pending task in original column for non-proposer viewers', () => {
    // C izleyicisi — proposer değil, orijinal kolonu görür.
    const viewer: AuthUser = { ...member, id: 'u3', displayId: 'CCCCC', fullName: 'Can' };
    useAuthStore.setState({ accessToken: 't', user: viewer });
    mockTasks = [
      makeTask({
        id: 't1',
        status: 'todo',
        pendingStatus: 'in_progress',
        pendingProposer: { id: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
      }),
    ];
    renderDashboard();
    const todoCol = screen.getByTestId('column-todo');
    expect(todoCol.querySelector('[data-testid="task-card-t1"]')).toBeInTheDocument();
    const inProgressCol = screen.getByTestId('column-in_progress');
    expect(inProgressCol.querySelector('[data-testid="task-card-t1"]')).toBeNull();
  });

  it('proposer sees card without pending badge (data-pending not set)', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTasks = [
      makeTask({
        id: 't1',
        status: 'todo',
        pendingStatus: 'in_progress',
        pendingProposer: { id: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null },
      }),
    ];
    renderDashboard();
    const card = screen.getByTestId('task-card-t1');
    expect(card.getAttribute('data-pending')).not.toBe('true');
    expect(card.textContent).not.toMatch(/Onay Bekliyor/);
  });

  it('does not render propose-confirm-dialog without drag', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    renderDashboard();
    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
  });

  it('shows multiple teams as tabs when sortedTeams > 1', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTeams = [
      { id: 'team-1', name: 'UX' },
      { id: 'team-2', name: 'Backend' },
    ];
    mockTeamDetail = { id: 'team-1', name: 'UX', members: [] };
    renderDashboard();
    expect(screen.getByTestId('team-tab-team-1')).toBeInTheDocument();
    expect(screen.getByTestId('team-tab-team-2')).toBeInTheDocument();
  });
});

// NOT: Drag-drop rol-dallanması (admin→direct mutate, member→propose mutate)
// handleDragEnd içinde — dnd-kit sensor simülasyonu karmaşık olduğu için
// burada test edilmiyor. Tarayıcı manuel flow'da (plan §"Tarayıcı manual")
// doğrulanır.
