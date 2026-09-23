import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPanel } from './NotificationPanel';

const invitation = {
  id: 'invitation-1',
  tenantId: 'tenant-a',
  companyName: 'Acme',
  inviterName: 'Ada Admin',
  status: 'pending' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
  respondedAt: null,
};

const items = [
  {
    id: 'n1',
    type: 'task_assigned' as const,
    payload: { taskId: 't1', taskTitle: 'Login fix', actorName: 'Ali' },
    readAt: null,
    createdAt: new Date().toISOString(),
  },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof NotificationPanel>> = {}) {
  return render(
    <MemoryRouter>
      <NotificationPanel
        items={items}
        unreadCount={1}
        onSelect={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
        invitations={[]}
        onAcceptInvitation={vi.fn()}
        onRejectInvitation={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('NotificationPanel', () => {
  it('renders empty state and footer without items', () => {
    renderPanel({ items: [], unreadCount: 0 });
    expect(screen.getByTestId('empty-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('view-all-notifications')).toBeInTheDocument();
  });

  it('has no load-more control and links to the full notifications page', async () => {
    const onViewAll = vi.fn();
    renderPanel({ onViewAll });
    expect(screen.queryByRole('button', { name: /daha fazla/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tüm bildirimleri gör' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Tüm bildirimleri gör' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('does not render pagination controls for the compact notification slice', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Sayfa 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tüm bildirimleri gör' })).toBeInTheDocument();
  });

  it('renders pending invitations before normal notifications', async () => {
    const user = userEvent.setup();
    const onAcceptInvitation = vi.fn();
    const onRejectInvitation = vi.fn();
    renderPanel({
      items: [],
      unreadCount: 0,
      invitations: [invitation],
      onAcceptInvitation,
      onRejectInvitation,
    });

    expect(screen.getByTestId('company-invitation-card-invitation-1')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-notifications')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Kabul Et' }));
    expect(onAcceptInvitation).toHaveBeenCalledWith('invitation-1');
  });
});
