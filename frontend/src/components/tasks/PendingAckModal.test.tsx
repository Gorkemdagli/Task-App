import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingAckModal } from './PendingAckModal';
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
  pendingStatus: 'in_progress',
  pendingProposedBy: 'u1',
  pendingProposedAt: new Date().toISOString(),
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
  ],
};

function renderModal(overrides: Partial<Parameters<typeof PendingAckModal>[0]> = {}) {
  const props = {
    task: baseTask,
    yourAcked: false,
    canCancel: true,
    onAck: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    isAcking: false,
    isCanceling: false,
    ...overrides,
  };
  return { ...render(<PendingAckModal {...props} />), props };
}

describe('PendingAckModal', () => {
  it('returns null when pendingStatus is null', () => {
    const { container } = render(
      <PendingAckModal
        task={{ ...baseTask, pendingStatus: null }}
        yourAcked={false}
        canCancel
        onAck={vi.fn()}
        onCancel={vi.fn()}
        onClose={vi.fn()}
        isAcking={false}
        isCanceling={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title with proposed status label', () => {
    renderModal();
    expect(screen.getByText(/Status teklifi: Yapılıyor/)).toBeInTheDocument();
  });

  it('renders proposer name in description when pendingProposer exists', () => {
    renderModal();
    expect(
      screen.getByText(/Ali Yılmaz bu görevi "Yapılıyor" olarak değiştirmek istiyor/),
    ).toBeInTheDocument();
  });

  it('renders fallback description when pendingProposer missing', () => {
    renderModal({ task: { ...baseTask, pendingProposer: null } });
    expect(screen.getByText(/Status değişikliği teklif edildi/)).toBeInTheDocument();
  });

  it('lists all assignees', () => {
    renderModal();
    expect(screen.getByText('Ali Yılmaz')).toBeInTheDocument();
    expect(screen.getByText('Selin Demir')).toBeInTheDocument();
  });

  it('marks proposer with "(öneren)" tag', () => {
    renderModal();
    expect(screen.getByText('(öneren)')).toBeInTheDocument();
  });

  it('shows "Onayladı" for assignees present in statusAcks', () => {
    renderModal({
      task: {
        ...baseTask,
        statusAcks: [
          { id: 'a1', userId: 'u2', proposedStatus: 'in_progress', ackedAt: new Date().toISOString() },
        ],
      },
    });
    expect(screen.getByText('Onayladı')).toBeInTheDocument();
    expect(screen.getByText('Bekliyor')).toBeInTheDocument();
  });

  it('shows "Bekliyor" for assignees not in statusAcks', () => {
    renderModal();
    expect(screen.getAllByText('Bekliyor').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Onayla button when yourAcked is false', () => {
    renderModal({ yourAcked: false });
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeInTheDocument();
  });

  it('hides Onayla button when yourAcked is true', () => {
    renderModal({ yourAcked: true });
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  it('shows İptal button when canCancel is true', () => {
    renderModal({ canCancel: true });
    expect(screen.getByRole('button', { name: 'İptal' })).toBeInTheDocument();
  });

  it('hides İptal button when canCancel is false', () => {
    renderModal({ canCancel: false });
    expect(screen.queryByRole('button', { name: 'İptal' })).toBeNull();
  });

  it('calls onAck when Onayla clicked', async () => {
    const onAck = vi.fn();
    renderModal({ onAck });
    await userEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(onAck).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when İptal clicked', async () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    await userEvent.click(screen.getByRole('button', { name: 'İptal' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close icon clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables buttons while acking', () => {
    renderModal({ isAcking: true });
    const ackBtn = screen.getByRole('button', { name: /Onaylanıyor/ });
    const cancelBtn = screen.getByRole('button', { name: 'İptal' });
    expect(ackBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it('disables buttons while canceling', () => {
    renderModal({ isCanceling: true });
    expect(screen.getByRole('button', { name: /İptal ediliyor/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeDisabled();
  });
});
