import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProposeConfirmDialog } from './ProposeConfirmDialog';
import type { Task } from '@/hooks/tasks';

const baseTask: Task = {
  id: 't1',
  title: 'Login bug',
  description: null,
  status: 'todo',
  priority: 'high',
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
  pendingProposer: { id: 'u1', displayId: 'AAAAA', fullName: 'Ali Yılmaz', avatarUrl: null },
  statusAcks: [],
  team: { id: 'team-1', name: 'UX', tenantId: 'tnt-1' },
  assigner: { id: 'u1', displayId: 'AAAAA', fullName: 'Ali Yılmaz', avatarUrl: null },
  assignees: [
    {
      userId: 'u1',
      assignedAt: new Date().toISOString(),
      user: { id: 'u1', displayId: 'AAAAA', fullName: 'Ali Yılmaz', avatarUrl: null },
    },
    {
      userId: 'u2',
      assignedAt: new Date().toISOString(),
      user: { id: 'u2', displayId: 'BBBBB', fullName: 'Selin Demir', avatarUrl: null },
    },
    {
      userId: 'u3',
      assignedAt: new Date().toISOString(),
      user: { id: 'u3', displayId: 'CCCCC', fullName: 'Can Polat', avatarUrl: null },
    },
  ],
};

function renderDialog(overrides: Partial<Parameters<typeof ProposeConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    task: baseTask,
    newStatus: 'in_progress' as const,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    isProposing: false,
    ...overrides,
  };
  return { ...render(<ProposeConfirmDialog {...props} />), props };
}

describe('ProposeConfirmDialog', () => {
  it('renders title with task title and target status', () => {
    renderDialog();
    expect(screen.getByText(/Status değişikliği teklif et/)).toBeInTheDocument();
    expect(
      screen.getByText(/"Login bug" görevini "Yapılıyor" olarak değiştirmek istiyorsun/),
    ).toBeInTheDocument();
  });

  it('renders Gönder and İptal buttons', () => {
    renderDialog();
    expect(screen.getByTestId('propose-confirm')).toHaveTextContent(/Gönder/);
    expect(screen.getByTestId('propose-cancel')).toHaveTextContent(/İptal/);
  });

  it('lists other assignees (excludes proposer)', () => {
    renderDialog();
    expect(screen.getByText('Selin Demir')).toBeInTheDocument();
    expect(screen.getByText('Can Polat')).toBeInTheDocument();
    expect(screen.queryByText('Ali Yılmaz')).not.toBeInTheDocument();
  });

  it('shows empty state when there are no other assignees', () => {
    renderDialog({
      task: {
        ...baseTask,
        assignees: [baseTask.assignees[0]], // sadece proposer
      },
    });
    expect(screen.getByText(/Başka atanan yok/)).toBeInTheDocument();
  });

  it('calls onConfirm when Gönder clicked', async () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    await userEvent.click(screen.getByTestId('propose-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when İptal clicked', async () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    await userEvent.click(screen.getByTestId('propose-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables buttons while proposing', () => {
    renderDialog({ isProposing: true });
    expect(screen.getByTestId('propose-confirm')).toBeDisabled();
    expect(screen.getByTestId('propose-cancel')).toBeDisabled();
    expect(screen.getByTestId('propose-confirm')).toHaveTextContent(/Gönderiliyor/);
  });

  it('renders content when open=true', () => {
    renderDialog({ open: true });
    expect(screen.getByTestId('propose-confirm-dialog')).toBeInTheDocument();
  });

  it('uses correct status label for newStatus=todo', () => {
    renderDialog({ newStatus: 'todo' });
    expect(
      screen.getByText(/"Login bug" görevini "Yapılacak" olarak değiştirmek istiyorsun/),
    ).toBeInTheDocument();
  });

  it('uses correct status label for newStatus=done', () => {
    renderDialog({ newStatus: 'done' });
    expect(
      screen.getByText(/"Login bug" görevini "Yapıldı" olarak değiştirmek istiyorsun/),
    ).toBeInTheDocument();
  });
});
