import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPanel } from './NotificationPanel';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockItems = [
  {
    id: 'n1',
    type: 'task_assigned' as const,
    payload: { taskId: 't1', taskTitle: 'Login fix', actorName: 'Ali' },
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    type: 'task_commented' as const,
    payload: { taskId: 't2', taskTitle: 'Deploy', actorName: 'Selin' },
    readAt: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
];

describe('NotificationPanel', () => {
  it('renders EmptyNotifications when items list is empty', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    render(
      <NotificationPanel
        items={[]}
        unreadCount={0}
        nextCursor={null}
        onLoadMore={vi.fn()}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    expect(screen.getByTestId('empty-notifications')).toBeInTheDocument();
  });

  it('renders all items', () => {
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={mockItems}
        unreadCount={2}
        nextCursor={null}
        onLoadMore={vi.fn()}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    expect(screen.getByTestId('notification-item-n1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-n2')).toBeInTheDocument();
  });

  it('shows "Daha fazla" button when nextCursor is present', () => {
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={mockItems}
        unreadCount={2}
        nextCursor="abc123"
        onLoadMore={vi.fn()}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    expect(screen.getByRole('button', { name: /daha fazla/i })).toBeInTheDocument();
  });

  it('hides "Daha fazla" button when nextCursor is null', () => {
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={mockItems}
        unreadCount={0}
        nextCursor={null}
        onLoadMore={vi.fn()}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    expect(screen.queryByRole('button', { name: /daha fazla/i })).toBeNull();
  });

  it('calls onLoadMore when "Daha fazla" clicked', async () => {
    const onLoadMore = vi.fn();
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={mockItems}
        unreadCount={2}
        nextCursor="abc123"
        onLoadMore={onLoadMore}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    await userEvent.click(screen.getByRole('button', { name: /daha fazla/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('calls onItemNavigate with task id when item clicked', async () => {
    const onItemNavigate = vi.fn();
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={mockItems}
        unreadCount={2}
        nextCursor={null}
        onLoadMore={vi.fn()}
        onItemNavigate={onItemNavigate}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    await userEvent.click(screen.getByTestId('notification-item-n1'));
    expect(onItemNavigate).toHaveBeenCalledWith('t1');
  });

  it('renders "Tümünü gör" footer even when items list is empty', () => {
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={[]}
        unreadCount={0}
        nextCursor={null}
        onLoadMore={vi.fn()}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
      { wrapper: wrapper(qc) },
    );
    expect(screen.getByTestId('view-all-notifications')).toBeInTheDocument();
  });

  it('calls onViewAll when "Tümünü gör" clicked', async () => {
    const onViewAll = vi.fn();
    const qc = new QueryClient();
    render(
      <NotificationPanel
        items={mockItems}
        unreadCount={2}
        nextCursor={null}
        onLoadMore={vi.fn()}
        onItemNavigate={vi.fn()}
        onMarkAllRead={vi.fn()}
        onViewAll={onViewAll}
      />,
      { wrapper: wrapper(qc) },
    );
    await userEvent.click(screen.getByTestId('view-all-notifications'));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });
});
