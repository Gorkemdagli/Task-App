import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { TaskDetailPage } from './index';
import type { Task, TaskStatus } from '@/hooks/tasks';

// Radix DropdownMenu portal'i jsdom'da güvenilmez (plan §3 "StatusDropdown
// onChange'i triggerlemek için Radix DropdownMenu'nun portal davranışı test'te
// sorun çıkarabilir"). Test amacı branch logic — onChange'i doğrudan
// çağırabilen bir stub yeterli.
vi.mock('@/components/tasks/StatusDropdown', () => ({
  StatusDropdown: ({
    value,
    onChange,
    disabled,
  }: {
    value: TaskStatus;
    onChange: (s: TaskStatus) => void;
    disabled?: boolean;
  }) => (
    <div
      data-testid="status-dropdown"
      data-value={value}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <button type="button" data-testid="status-pick-todo" onClick={() => onChange('todo')}>
        Yapılacak
      </button>
      <button
        type="button"
        data-testid="status-pick-in_progress"
        onClick={() => onChange('in_progress')}
      >
        Yapılıyor
      </button>
      <button type="button" data-testid="status-pick-done" onClick={() => onChange('done')}>
        Yapıldı
      </button>
    </div>
  ),
}));

// ProposeConfirmDialog da Radix Dialog kullanır — stub'la, branch testine odaklan.
vi.mock('@/components/tasks/ProposeConfirmDialog', () => ({
  ProposeConfirmDialog: ({
    open,
    task,
    newStatus,
    onConfirm,
    onCancel,
    isProposing,
  }: {
    open: boolean;
    task: Task;
    newStatus: TaskStatus;
    onConfirm: () => void;
    onCancel: () => void;
    isProposing: boolean;
  }) =>
    open ? (
      <div data-testid="propose-confirm-dialog" data-proposing={isProposing ? 'true' : 'false'}>
        <span data-testid="propose-task-id">{task.id}</span>
        <span data-testid="propose-new-status">{newStatus}</span>
        <button type="button" data-testid="propose-cancel" onClick={onCancel}>
          İptal
        </button>
        <button type="button" data-testid="propose-confirm" onClick={onConfirm}>
          Gönder
        </button>
      </div>
    ) : null,
}));

// PendingAckModal davranışı bu sayfada kontrollü açık/kapalı state ile bağlanır.
vi.mock('@/components/tasks/PendingAckModal', () => ({
  PendingAckModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="pending-ack-modal">
      <button type="button" data-testid="pending-ack-close" onClick={onClose}>
        Kapat
      </button>
    </div>
  ),
}));

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeam: () => ({ data: { members: [] }, isLoading: false, isError: false }),
}));

let mockTask: Task | null = null;
// Dialog kapanış testi için proposeMock onSettled callback'ini invoke etsin.
// vi.clearAllMocks() implementation'ı siler, beforeEach'te tekrar bağlanır.
const proposeMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/hooks/tasks', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useTask: () => ({ data: mockTask, isLoading: false, isError: false }),
    useTaskComments: () => ({ data: { comments: [] }, isLoading: false, isError: false }),
    useUpdateTaskStatus: () => ({ mutate: updateMock, mutateAsync: updateMock, isPending: false }),
    useProposeTaskStatus: () => ({
      mutate: proposeMock,
      mutateAsync: proposeMock,
      isPending: false,
    }),
    useAckTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useCancelTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useUpdateTaskPriority: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useUpdateTaskFields: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useDeleteTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
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

function makeAssignee(userId: string, fullName: string) {
  return {
    userId,
    assignedAt: new Date().toISOString(),
    user: { id: userId, displayId: userId.toUpperCase(), fullName, avatarUrl: null },
  };
}

function renderTaskDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/tasks/t1']}
      >
        <Routes>
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskDetailPage — status change intercept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks sonrası implementation bağlantısı kaybolur; onSettled'i
    // simulate etmek için tekrar bağla (dialog close testi).
    proposeMock.mockImplementation((_vars: unknown, opts?: { onSettled?: () => void }) => {
      opts?.onSettled?.();
    });
    useAuthStore.setState({ accessToken: 't', user: member });
  });

  it('multi-assignee + member: dropdown onChange opens ProposeConfirmDialog, propose NOT called', async () => {
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('propose-new-status')).toHaveTextContent('done');
    expect(proposeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('multi-assignee + member: dialog confirm calls proposeStatus.mutate and closes dialog', async () => {
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('propose-confirm'));
    expect(proposeMock).toHaveBeenCalledTimes(1);
    expect(proposeMock).toHaveBeenCalledWith(
      { taskId: 't1', status: 'done' },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
  });

  it('multi-assignee + member: dialog cancel closes without calling propose', async () => {
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('propose-cancel'));
    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it('pending ack modal close hides modal without canceling request', async () => {
    mockTask = makeTask({
      pendingStatus: 'in_progress',
      pendingProposedBy: 'u2',
      pendingProposer: { id: 'u2', displayId: 'U2', fullName: 'Selin', avatarUrl: null },
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    expect(screen.getByTestId('pending-ack-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('pending-ack-close'));
    expect(screen.queryByTestId('pending-ack-modal')).toBeNull();
  });

  it('single-assignee + member: dropdown onChange calls proposeStatus.mutate, no dialog', async () => {
    mockTask = makeTask({}); // default 1 assignee
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
    expect(proposeMock).toHaveBeenCalledTimes(1);
    expect(proposeMock).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('member without team admin membership uses proposal flow', async () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('admin + single-assignee: dropdown onChange calls updateStatus.mutate, no dialog', async () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTask = makeTask({}); // default 1 assignee
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it('admin + multi-assignee: dropdown onChange opens ProposeConfirmDialog, update NOT called', async () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('propose-new-status')).toHaveTextContent('done');
    expect(updateMock).not.toHaveBeenCalled();
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it('admin + multi-assignee: dialog confirm calls proposeStatus.mutate and closes dialog', async () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('status-pick-done'));
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('propose-confirm'));
    expect(proposeMock).toHaveBeenCalledTimes(1);
    expect(proposeMock).toHaveBeenCalledWith(
      { taskId: 't1', status: 'done' },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    expect(screen.queryByTestId('propose-confirm-dialog')).toBeNull();
  });

  it('pending banner: proposer is assignee → "önerdi ve onayladı" + kalan 1/2', async () => {
    // u2 (assignee) proposed. u1 viewer (also assignee, not proposer) sees banner.
    // Backend auto-acks proposer → statusAcks.length=1 → kalan 1/2.
    mockTask = makeTask({
      pendingStatus: 'in_progress',
      pendingProposedBy: 'u2',
      pendingProposedAt: new Date().toISOString(),
      pendingProposer: { id: 'u2', displayId: 'U2', fullName: 'Sedat', avatarUrl: null },
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Sedat')],
      statusAcks: [
        {
          id: 'a1',
          userId: 'u2',
          proposedStatus: 'in_progress',
          pendingVersion: 1,
          ackedAt: new Date().toISOString(),
        },
      ],
    });
    useAuthStore.setState({ accessToken: 't', user: member });
    renderTaskDetail();

    const banner = screen.getByTestId('pending-banner');
    expect(banner).toHaveTextContent('Sedat status değişikliği önerdi ve onayladı');
    expect(banner).toHaveTextContent('Kalan ack: 1 / 2');
  });

  it('pending banner: proposer is not assignee → "teklif etti" + kalan 2/2', async () => {
    // Admin (not assignee) proposed. Backend cannot auto-ack (admin not assignee) → 0/2.
    mockTask = makeTask({
      pendingStatus: 'in_progress',
      pendingProposedBy: 'u9',
      pendingProposedAt: new Date().toISOString(),
      pendingProposer: { id: 'u9', displayId: 'U9', fullName: 'Yönetici', avatarUrl: null },
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
      statusAcks: [],
    });
    useAuthStore.setState({ accessToken: 't', user: member });
    renderTaskDetail();

    const banner = screen.getByTestId('pending-banner');
    expect(banner).toHaveTextContent('Yönetici status değişikliği teklif etti');
    expect(banner).toHaveTextContent('Kalan ack: 2 / 2');
  });
});
