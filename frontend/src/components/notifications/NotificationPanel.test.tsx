import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPanel } from './NotificationPanel';

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
    <NotificationPanel
      items={items}
      unreadCount={1}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={vi.fn()}
      onSelect={vi.fn()}
      onMarkAllRead={vi.fn()}
      onViewAll={vi.fn()}
      {...overrides}
    />,
  );
}

describe('NotificationPanel', () => {
  it('renders empty state and footer without items', () => {
    renderPanel({ items: [], unreadCount: 0 });
    expect(screen.getByTestId('empty-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('view-all-notifications')).toBeInTheDocument();
  });

  it('shows load-more only when another page exists', () => {
    renderPanel({ hasNextPage: true });
    expect(screen.getByRole('button', { name: /daha fazla/i })).toBeInTheDocument();
  });

  it('loads more once and disables while fetching', async () => {
    const onLoadMore = vi.fn();
    const view = renderPanel({ hasNextPage: true, isFetchingNextPage: true, onLoadMore });
    const button = view.getByRole('button', { name: /daha fazla/i });
    expect(button).toBeDisabled();

    view.rerender(
      <NotificationPanel
        items={items}
        unreadCount={1}
        hasNextPage
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
        onSelect={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );
    await userEvent.click(view.getByRole('button', { name: /daha fazla/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
