import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MouseSensor, TouchSensor } from '@dnd-kit/core';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { DashboardPage } from './index';
import type { Task } from '@/hooks/tasks';
import { utcTodayCalendarDate } from '@/lib/calendarDate';

const { useDroppableMock, useSensorMock, useSensorsMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useSensorMock: vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })),
  useSensorsMock: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDroppable: useDroppableMock,
    useSensor: useSensorMock,
    useSensors: useSensorsMock,
  };
});

// Hook stub'ları: drag-drop simülasyonu yapmadan sayfa seviyesinde
// render/role/branch davranışını doğrulamak için.
const mocks = {
  useUpdateTaskStatus: vi.fn(),
  useProposeTaskStatus: vi.fn(),
};
void mocks; // referans korunsun (gelecek drag-drop testleri için yer tutucu)

let lastTaskFilters: unknown;
let mockSelectedTask: Task | undefined;

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: mockTeams, isLoading: false, isError: false }),
  useTeam: () => ({ data: mockTeamDetail, isLoading: false, isError: false }),
}));

vi.mock('@/hooks/tasks', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useTasks: (filters: unknown) => {
      lastTaskFilters = filters;
      return {
        data: { tasks: mockTasks, total: mockTasks.length },
        isLoading: false,
        isError: false,
      };
    },
    useTask: () => ({ data: mockSelectedTask, isLoading: false, isError: false }),
    useTaskComments: () => ({ data: { comments: [] }, isLoading: false, isError: false }),
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

function calendarDateOffset(offset: number): string {
  const [year, month, day] = utcTodayCalendarDate().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.toISOString().slice(0, 10);
}

let mockTasks: Task[] = [];

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockTeams = [{ id: 'team-1', name: 'UX' }];
    mockTeamDetail = {
      id: 'team-1',
      name: 'UX',
      members: [{ userId: 'u1', fullName: 'Ada', avatarUrl: null, role: 'member' }],
    };
    useTeamStore.setState({ activeTeamId: null });
    mockTasks = [];
    lastTaskFilters = undefined;
    mockSelectedTask = undefined;
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

  it('stacks workflow and kanban columns on mobile', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderDashboard();

    expect(screen.getByTestId('workflow-strip')).toHaveClass('grid', 'md:flex');

    const board = screen.getByTestId('column-todo').parentElement;
    expect(board).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-3');
    expect(screen.getByTestId('column-todo')).not.toHaveClass('w-[85vw]', 'shrink-0');
    expect(screen.getByTestId('column-in_progress')).not.toHaveClass('w-[85vw]', 'shrink-0');
    expect(screen.getByTestId('column-done')).not.toHaveClass('w-[85vw]', 'shrink-0');
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

  it('configures mouse and touch sensors for drag and drop', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderDashboard();

    const calls = useSensorMock.mock.calls as unknown as Array<[typeof MouseSensor, unknown]>;
    expect(calls.map(([sensor]) => sensor)).toEqual([MouseSensor, TouchSensor]);
    expect(calls[1][1]).toEqual({ activationConstraint: { delay: 180, tolerance: 8 } });
  });

  it('shows one-card mobile carousel controls when a column has multiple tasks', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [makeTask({ id: 'todo-1' }), makeTask({ id: 'todo-2' })];
    renderDashboard();

    const carousel = screen.getByTestId('task-carousel-todo');
    expect(carousel).toHaveClass('flex', 'snap-x', 'overflow-x-auto');
    const previousButton = screen.getByRole('button', { name: 'Yapılacak önceki görev' });
    const nextButton = screen.getByRole('button', { name: 'Yapılacak sonraki görev' });
    const controls = previousButton.parentElement;
    expect(previousButton).not.toHaveClass('absolute');
    expect(nextButton).not.toHaveClass('absolute');
    expect(controls).toHaveClass('mt-3', 'flex', 'justify-between', 'md:hidden');
    expect(carousel.compareDocumentPosition(controls!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('task-card-todo-1').parentElement).toHaveClass(
      'min-w-full',
      'snap-start',
    );
    expect(screen.getByTestId('task-card-todo-2').parentElement).toHaveClass(
      'min-w-full',
      'snap-start',
    );

    const scrollBy = vi.fn();
    Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(carousel, 'scrollBy', { configurable: true, value: scrollBy });
    fireEvent.click(screen.getByRole('button', { name: 'Yapılacak sonraki görev' }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' });
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

  it('starts company admin dashboards on all teams', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTeams = [
      { id: 'team-1', name: 'UX' },
      { id: 'team-2', name: 'Backend' },
    ];
    useTeamStore.setState({ activeTeamId: 'team-2' });

    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Tüm Takımlar' })).toBeInTheDocument();
    expect(screen.getByTestId('team-tab-all').className).toContain('border-primary');
  });

  it('writes Dashboard tab selection to the shared team store', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTeams = [
      { id: 'team-1', name: 'UX' },
      { id: 'team-2', name: 'Backend' },
    ];

    renderDashboard();
    fireEvent.click(screen.getByTestId('team-tab-team-2'));

    expect(useTeamStore.getState().activeTeamId).toBe('team-2');
  });

  it('shows risk counts and filters admin tasks by upcoming deadlines', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [
      makeTask({ id: 'overdue', deadline: calendarDateOffset(-1) }),
      makeTask({ id: 'today', deadline: utcTodayCalendarDate(), status: 'in_progress' }),
      makeTask({ id: 'pending', pendingStatus: 'in_progress' }),
      makeTask({ id: 'upcoming', deadline: calendarDateOffset(1), status: 'done' }),
      makeTask({ id: 'far-upcoming', deadline: calendarDateOffset(30) }),
    ];

    renderDashboard();

    expect(screen.getByTestId('workflow-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-count-overdue')).toHaveTextContent('1');
    expect(screen.getByTestId('workflow-count-today')).toHaveTextContent('1');
    expect(screen.getByTestId('workflow-count-pending')).toHaveTextContent('1');
    expect(screen.getByTestId('workflow-count-upcoming')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('workflow-filter-upcoming'));

    expect(screen.getByTestId('task-card-upcoming')).toBeInTheDocument();
    expect(screen.getByTestId('task-card-far-upcoming')).toBeInTheDocument();
    expect(screen.queryByTestId('task-card-overdue')).toBeNull();
  });

  it('shows archived tasks from the final workflow filter without drag affordance', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTasks = [
      makeTask({ id: 'active-task' }),
      makeTask({ id: 'archived-task', archivedAt: '2026-08-01T00:00:00.000Z', status: 'done' }),
    ];

    renderDashboard();

    expect(lastTaskFilters).toMatchObject({ includeArchived: true });
    expect(screen.getByTestId('workflow-filter-archived')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-count-archived')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('workflow-filter-archived'));

    expect(screen.getByTestId('task-card-archived-task')).toBeInTheDocument();
    expect(screen.queryByTestId('task-card-active-task')).toBeNull();
    expect(screen.getByTestId('task-card-archived-task')).not.toHaveAttribute('role', 'button');
  });

  it('loads all teams for a company admin until a team is selected', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTeams = [
      { id: 'team-1', name: 'UX' },
      { id: 'team-2', name: 'Backend' },
    ];
    mockTeamDetail = { id: 'team-1', name: 'UX', members: [] };
    renderDashboard();

    expect(screen.getByTestId('team-tab-all')).toBeInTheDocument();
    expect(lastTaskFilters).toMatchObject({ includeArchived: true });

    fireEvent.click(screen.getByTestId('team-tab-team-2'));

    expect(lastTaskFilters).toMatchObject({ teamId: 'team-2' });
  });

  it('requests only the current member tasks', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    renderDashboard();

    expect(lastTaskFilters).toMatchObject({ assigneeIds: ['u1'] });
    expect(screen.queryByTestId('workflow-strip')).toBeNull();
  });

  it('opens the selected member task in the dashboard detail panel', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    mockSelectedTask = makeTask({
      id: 'selected-task',
      title: 'Seçilen görev',
      status: 'in_progress',
      priority: 'high',
    });
    mockTasks = [mockSelectedTask];

    renderDashboard();
    fireEvent.click(screen.getByTestId('task-card-selected-task').querySelector('a')!);

    const panel = screen.getByTestId('member-task-detail-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Seçilen görev');
    expect(screen.getByTestId('task-card-selected-task').className).toContain('ring-primary');
    expect(within(panel).getByText('Yapılıyor')).toHaveClass(
      'border-status-inprogress/40',
      'bg-status-inprogress/10',
      'text-status-inprogress',
    );
    expect(within(panel).getByText('Yüksek')).toHaveClass(
      'border-priority-high/40',
      'bg-priority-high/10',
      'text-priority-high',
    );
    expect(screen.getByTestId('dashboard-page')).toHaveClass('lg:pr-[min(38vw,32rem)]');
    expect(screen.getByTestId('member-task-detail-panel')).toHaveClass(
      'lg:fixed',
      'lg:right-0',
      'lg:top-14',
      'lg:bottom-0',
      'lg:w-[min(38vw,32rem)]',
    );
    expect(screen.getByRole('link', { name: 'Göreve git' })).toHaveAttribute(
      'href',
      '/tasks/selected-task',
    );
    expect(screen.getByRole('link', { name: 'Seçilen görev' })).toHaveAttribute(
      'href',
      '/tasks/selected-task',
    );
  });

  it('opens the dashboard detail panel for admin task cards on desktop', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockSelectedTask = makeTask({ id: 'admin-task', title: 'Yönetici görevi' });
    mockTasks = [mockSelectedTask];

    renderDashboard();
    fireEvent.click(screen.getByTestId('task-card-admin-task').querySelector('a')!);

    expect(screen.getByTestId('member-task-detail-panel')).toBeInTheDocument();
    expect(screen.getByTestId('member-task-detail-panel')).toHaveTextContent('Yönetici görevi');
  });

  it('navigates directly to the task on responsive viewports', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTasks = [makeTask({ id: 'mobile-task', title: 'Mobil görev' })];

    renderDashboard();
    fireEvent.click(screen.getByTestId('task-card-mobile-task').querySelector('a')!);

    expect(screen.getByTestId('location')).toHaveTextContent('/tasks/mobile-task');
    expect(screen.queryByTestId('member-task-detail-panel')).toBeNull();
  });
});

// NOT: Drag-drop rol-dallanması (admin→direct mutate, member→propose mutate)
// handleDragEnd içinde — dnd-kit sensor simülasyonu karmaşık olduğu için
// burada test edilmiyor. Tarayıcı manuel flow'da (plan §"Tarayıcı manual")
// doğrulanır.
