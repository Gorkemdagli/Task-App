import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { TaskDetailPage } from './index';
import type { Task, TaskStatus } from '@/hooks/tasks';
import type { TeamMember } from '@/services/teams';

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

let mockTask: Task | null = null;
let mockTeamMembers: TeamMember[] = [];
vi.mock('@/hooks/queries/useTeams', () => ({
  useTeam: () => ({ data: { members: mockTeamMembers }, isLoading: false, isError: false }),
}));

// Dialog kapanış testi için proposeMock onSettled callback'ini invoke etsin.
// vi.clearAllMocks() implementation'ı siler, beforeEach'te tekrar bağlanır.
const proposeMock = vi.fn();
const updateMock = vi.fn();
const blockMock = vi.fn();
const deleteMock = vi.fn();
const restoreMock = vi.fn();
const updateFieldsMock = vi.fn();
let updateFieldsPending = false;

vi.mock('@/hooks/tasks', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useTask: () => ({ data: mockTask, isLoading: false, isError: false }),
    useTaskComments: () => ({ data: { comments: [] }, isLoading: false, isError: false }),
    useTaskFiles: () => ({ data: { files: [] }, isLoading: false, isError: false }),
    useTaskHistory: () => ({
      data: { pages: [{ items: [] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }),
    useUpdateTaskStatus: () => ({ mutate: updateMock, mutateAsync: updateMock, isPending: false }),
    useProposeTaskStatus: () => ({
      mutate: proposeMock,
      mutateAsync: proposeMock,
      isPending: false,
    }),
    useAckTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useCancelTaskStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useUpdateTaskPriority: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useUpdateTaskBlocked: () => ({ mutate: blockMock, mutateAsync: blockMock, isPending: false }),
    useUpdateTaskFields: () => ({
      mutate: updateFieldsMock,
      mutateAsync: updateFieldsMock,
      isPending: updateFieldsPending,
    }),
    useRestoreTask: () => ({ mutate: restoreMock, mutateAsync: restoreMock, isPending: false }),
    useDeleteTask: () => ({ mutate: deleteMock, mutateAsync: deleteMock, isPending: false }),
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
    scopeItems: [],
    targetAudience: null,
    expectedOutput: null,
    tags: [],
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

describe('TaskDetailPage — approved workbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeamMembers = [];
    updateFieldsMock.mockReset();
    updateFieldsPending = false;
    useAuthStore.setState({ accessToken: 't', user: admin });
  });

  it('renders the semantic desktop regions and real task context with the task reference', () => {
    mockTask = makeTask({
      id: '2841',
      title: 'Launch brief',
      scopeItems: ['Research', 'Research'],
      targetAudience: 'Product team',
      expectedOutput: 'Approved brief',
      tags: ['launch', 'brief'],
    });
    renderTaskDetail();

    const taskDetailPage = screen.getByTestId('task-detail-page');
    expect(taskDetailPage).toHaveClass('lg:h-[calc(100dvh-3.5rem)]', 'lg:min-h-0', 'lg:flex-col');
    expect(taskDetailPage).toHaveClass('lg:pb-4');
    const workbench = taskDetailPage.querySelector('.task-detail-workbench');
    expect(workbench).toHaveClass('lg:min-h-0', 'lg:flex-1');
    expect(screen.getByRole('complementary', { name: 'Görev bilgileri ve geçmiş' })).toBeInTheDocument();
    const taskContent = screen.getByRole('region', { name: 'Görev içeriği' });
    expect(taskContent).toBeInTheDocument();
    expect(taskContent).toHaveClass('max-h-[calc(100dvh-10rem)]', 'overflow-y-auto');
    expect(taskContent).not.toHaveClass('overscroll-contain');
    expect(taskContent).toHaveClass('lg:overscroll-contain');
    expect(screen.getByRole('complementary', { name: 'Dosyalar ve yorumlar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dosyalar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Yorumlar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Geçmiş' })).toBeInTheDocument();
    expect(screen.getAllByText('Research')).toHaveLength(2);
    expect(screen.getByText('Approved brief')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hedef kitle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Etiketler' })).toBeInTheDocument();
    expect(screen.getByText('Product team')).toBeInTheDocument();
    expect(screen.getByText('launch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeInTheDocument();

    const filesRegion = screen.getByTestId('task-files-region');
    const filesScrollRegion = filesRegion.querySelector('div');
    expect(filesRegion).toHaveClass('max-h-[24rem]', 'overflow-hidden');
    expect(filesScrollRegion).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(filesScrollRegion).not.toHaveClass('overscroll-contain');
    expect(filesScrollRegion).toHaveClass('lg:overflow-y-auto');
    expect(filesScrollRegion).toHaveClass('lg:overscroll-contain');
    expect(filesScrollRegion).not.toHaveClass('lg:overflow-y-scroll');

    const taskInfo = screen.getByRole('heading', { name: 'Görev bilgileri' }).closest('section');
    const historyRegion = screen.getByRole('region', { name: 'Görev geçmişi' });
    const taskInfoAndHistory = screen.getByRole('complementary', {
      name: 'Görev bilgileri ve geçmiş',
    });
    expect(taskInfo?.parentElement).toBe(taskInfoAndHistory);
    expect(historyRegion.closest('aside')).toBe(taskInfoAndHistory);
    expect(taskInfoAndHistory).toHaveClass('flex', 'rounded-lg', 'border', 'overflow-hidden');
    expect(taskInfo).not.toHaveClass('overflow-y-auto', 'max-h-[24rem]');
    expect(historyRegion).toHaveClass('max-h-[18rem]', 'overflow-y-auto');
    expect(historyRegion).not.toHaveClass('overscroll-contain');
    expect(historyRegion).toHaveClass('lg:overscroll-contain');

    const commentsRegion = screen.getByTestId('task-comments-region');
    expect(commentsRegion).toHaveClass('max-h-[28rem]', 'overflow-hidden');
    expect(commentsRegion).toHaveClass('lg:flex', 'lg:min-h-0', 'lg:flex-col');
    const commentsScrollRegion = commentsRegion.querySelector('h2 + div');
    expect(commentsScrollRegion).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(commentsScrollRegion).not.toHaveClass('overscroll-contain');
    expect(commentsScrollRegion).toHaveClass('lg:overscroll-contain');
    expect(commentsScrollRegion).toHaveClass('lg:flex-1', 'lg:min-h-0', 'lg:overflow-y-auto');
    const commentComposer = screen.getByTestId('comment-input').closest('form');
    expect(commentComposer?.parentElement).toHaveClass('shrink-0');
  });

  it('uses the shared avatar stack when more than two assignees are present', () => {
    mockTask = makeTask({
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin'), makeAssignee('u3', 'Mert')],
    });
    renderTaskDetail();

    expect(screen.getByTestId('assignee-avatar-stack')).toBeInTheDocument();
    expect(screen.getByLabelText('+1 kişi daha')).toBeInTheDocument();
    expect(screen.queryByText('Mert')).not.toBeInTheDocument();
  });

  it('keeps task context read-only for a member and hides the edit action', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTask = makeTask({ scopeItems: ['Member scope'], targetAudience: 'Members' });
    renderTaskDetail();

    expect(screen.getByText('Member scope')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sorumlu Ekle')).not.toBeInTheDocument();
  });

  it('lets an admin stage assignee additions and removals and saves the final assignee ids', async () => {
    mockTeamMembers = [
      {
        userId: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null,
        role: 'member', joinedAt: new Date().toISOString(),
      },
      {
        userId: 'u2', displayId: 'BBBBB', fullName: 'Selin', avatarUrl: null,
        role: 'member', joinedAt: new Date().toISOString(),
      },
    ];
    updateFieldsMock.mockImplementation((_variables, options) => options?.onSuccess?.());
    mockTask = makeTask({ assignees: [makeAssignee('u1', 'Ada')] });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    await user.click(screen.getByTestId('assignee-picker-trigger'));
    await user.click(await screen.findByTestId('assignee-option-u2'));
    expect(screen.getByTestId('assignee-chip-u2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ada kaldır' }));
    expect(screen.queryByTestId('assignee-chip-u1')).not.toBeInTheDocument();
    expect(screen.getByTestId('assignee-chip-u2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    expect(updateFieldsMock.mock.calls[0][0]).toMatchObject({
      taskId: 't1',
      assigneeIds: ['u2'],
    });
  });

  it('prevents removing the final assignee in edit mode', async () => {
    mockTeamMembers = [
      {
        userId: 'u1', displayId: 'AAAAA', fullName: 'Ada', avatarUrl: null,
        role: 'member', joinedAt: new Date().toISOString(),
      },
    ];
    mockTask = makeTask({ assignees: [makeAssignee('u1', 'Ada')] });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    expect(screen.getByRole('button', { name: 'Ada kaldır' })).toBeDisabled();
    await user.click(screen.getByTestId('assignee-picker-trigger'));
    const finalAssigneeOption = screen.getByTestId('assignee-option-u1');
    expect(finalAssigneeOption).toHaveAttribute('aria-disabled', 'true');
    await user.click(finalAssigneeOption);
    expect(screen.getByTestId('assignee-chip-u1')).toBeInTheDocument();
  });

  it('keeps the admin edit form open and shows an inline error when saving fails', async () => {
    updateFieldsMock.mockImplementation((_variables, options) => {
      options?.onError?.(new Error('save failed'));
    });
    mockTask = makeTask({
      description: 'Before',
      scopeItems: ['First item'],
      targetAudience: 'Members',
      expectedOutput: 'Brief',
      tags: ['initial'],
    });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    expect(screen.getByTestId('task-edit-form')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Değişiklikler kaydedilemedi.');
    expect(screen.getByLabelText('Başlık')).toHaveValue('Test task');
  });

  it('edits audience and tags and includes them in the edit payload', async () => {
    updateFieldsMock.mockImplementation((_variables, options) => {
      options?.onSuccess?.();
    });
    mockTask = makeTask({ targetAudience: 'Members', tags: ['initial'] });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));

    expect(screen.getByLabelText('Hedef kitle')).toHaveValue('Members');
    expect(screen.getByLabelText('Etiketler (virgülle ayır)')).toHaveValue('initial');

    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    const [payload] = updateFieldsMock.mock.calls[0];
    expect(payload).toEqual({
      taskId: 't1',
      title: 'Test task',
      description: null,
      scopeItems: [],
      targetAudience: 'Members',
      expectedOutput: null,
      tags: ['initial'],
      assigneeIds: ['u1'],
    });
  });

  it('requires delete confirmation and cancel does not mutate', async () => {
    mockTask = makeTask({ title: 'Delete me' });
    renderTaskDetail();
    const user = userEvent.setup();

    expect(screen.getAllByRole('button', { name: 'Görevi sil' })).toHaveLength(1);
    expect(screen.getByTestId('task-title-section')).toContainElement(
      screen.getByTestId('task-delete-trigger'),
    );
    expect(screen.getByRole('banner')).not.toContainElement(screen.getByTestId('task-delete-trigger'));
    await user.click(screen.getByTestId('task-delete-trigger'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete me');
    expect(deleteMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('task-delete-cancel'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-delete-trigger')).toHaveFocus();

    await user.click(screen.getByTestId('task-delete-trigger'));
    await user.click(screen.getByTestId('task-delete-confirm'));
    expect(deleteMock).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(screen.getByTestId('task-delete-trigger')).toHaveFocus());
  });

  it('cancels delete confirmation on Escape without mutating and restores trigger focus', async () => {
    mockTask = makeTask({ title: 'Delete me' });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByTestId('task-delete-trigger'));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-delete-trigger')).toHaveFocus();
  });

  it('hides delete and block actions from an unauthorized member', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTask = makeTask({ assignees: [makeAssignee('u2', 'Selin')] });
    renderTaskDetail();

    expect(screen.queryByTestId('task-delete-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-block-toggle')).not.toBeInTheDocument();
  });

  it('closes and resets the admin edit form only after a successful save', async () => {
    updateFieldsMock.mockImplementation((_variables, options) => {
      options?.onSuccess?.();
    });
    mockTask = makeTask({ scopeItems: ['First item'], tags: ['initial'] });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    expect(screen.queryByTestId('task-edit-form')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    expect(screen.getByLabelText('Kapsam (her satır bir madde)')).toHaveValue('First item');
  });

  it('disables edit cancellation while structured fields are saving', async () => {
    updateFieldsPending = true;
    mockTask = makeTask({ scopeItems: ['First item'] });
    renderTaskDetail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    const cancelButtons = screen.getAllByRole('button', { name: 'Vazgeç' });

    expect(cancelButtons).toHaveLength(2);
    cancelButtons.forEach((button) => expect(button).toBeDisabled());
    await user.click(cancelButtons[0]);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('task-edit-form')).toBeInTheDocument();
  });
});

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
      <MemoryRouter initialEntries={['/tasks/t1']}>
        <Routes>
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskDetailPage — archived task restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateFieldsMock.mockReset();
    updateFieldsPending = false;
    useAuthStore.setState({ accessToken: 't', user: admin });
  });

  it('company admin selects a valid deadline and restores an archived task', async () => {
    mockTask = makeTask({ archivedAt: '2026-08-01T00:00:00.000Z', deadline: '2026-08-01' });
    renderTaskDetail();

    const restoreButton = screen.getByTestId('restore-task-button');
    expect(restoreButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Son Tarih'), { target: { value: '2099-01-01' } });
    expect(restoreButton).not.toBeDisabled();
    await userEvent.click(restoreButton);

    expect(restoreMock).toHaveBeenCalledWith({ taskId: 't1', deadline: '2099-01-01' });
  });

  it('regular member does not see archived task restore control', () => {
    useAuthStore.setState({ accessToken: 't', user: member });
    mockTask = makeTask({ archivedAt: '2026-08-01T00:00:00.000Z', deadline: '2026-08-01' });
    renderTaskDetail();

    expect(screen.queryByTestId('restore-task-button')).toBeNull();
  });
});

describe('TaskDetailPage — status change intercept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateFieldsMock.mockReset();
    updateFieldsPending = false;
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

  it('does not auto-open an ack modal and pulses the pending banner', () => {
    mockTask = makeTask({
      pendingStatus: 'in_progress',
      pendingProposedBy: 'u2',
      pendingProposer: { id: 'u2', displayId: 'U2', fullName: 'Selin', avatarUrl: null },
      assignees: [makeAssignee('u1', 'Ada'), makeAssignee('u2', 'Selin')],
    });
    renderTaskDetail();

    expect(screen.queryByTestId('pending-ack-modal')).toBeNull();
    expect(screen.getByTestId('pending-banner')).toHaveClass('task-pending-banner--pulse');
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

  it('assigned member can block and unblock a task from the detail page', async () => {
    mockTask = makeTask({ blockedReason: null });
    const user = userEvent.setup();
    const rendered = renderTaskDetail();

    await user.click(screen.getByTestId('task-block-toggle'));
    expect(screen.getByTestId('task-block-confirmation')).toBeInTheDocument();
    expect(blockMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('task-block-cancel'));
    expect(screen.queryByTestId('task-block-confirmation')).not.toBeInTheDocument();
    expect(blockMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-block-toggle')).toHaveFocus();

    await user.click(screen.getByTestId('task-block-toggle'));
    await user.type(screen.getByLabelText('Engel nedeni (isteğe bağlı)'), '  API bekleniyor  ');
    expect(screen.getByLabelText('Engel nedeni (isteğe bağlı)')).toHaveAttribute('maxLength', '500');
    await user.click(screen.getByTestId('task-block-confirm'));

    expect(blockMock).toHaveBeenCalledWith({
      taskId: 't1',
      isBlocked: true,
      blockedReason: 'API bekleniyor',
    });
    expect(screen.getByTestId('task-block-toggle')).toHaveFocus();

    mockTask = makeTask({ isBlocked: true, blockedReason: 'API bekleniyor' });
    rendered.unmount();
    renderTaskDetail();
    await user.click(screen.getByTestId('task-block-toggle'));
    expect(blockMock).toHaveBeenLastCalledWith({ taskId: 't1', isBlocked: false });
  });

  it('cancels block confirmation on Escape without mutating and restores trigger focus', async () => {
    mockTask = makeTask({ blockedReason: null });
    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByTestId('task-block-toggle'));
    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('task-block-confirmation')).not.toBeInTheDocument();
    expect(blockMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-block-toggle')).toHaveFocus();
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
