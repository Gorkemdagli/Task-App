import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsPage } from './index';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { api } from '@/lib/api';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';

const member: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'member',
  tenantId: 't1',
  tenantName: 'Acme A.Ş.',
};

function makeItem(id: string, overrides: Partial<NotificationItemType> = {}): NotificationItemType {
  return {
    id,
    type: 'task_assigned',
    payload: { taskId: 'task-1', taskTitle: `Task ${id}`, actorName: 'Ayşe' },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationsPage', () => {
  let getSpy: MockInstance;
  let patchSpy: MockInstance;

  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} } as never);
  });

  afterEach(() => {
    getSpy?.mockRestore();
    patchSpy.mockRestore();
  });

  it('renders header "Bildirimler"', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);

    renderPage();

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/notifications');
    });

    expect(screen.getByRole('heading', { name: 'Bildirimler' })).toBeInTheDocument();
  });

  it('renders EmptyNotifications when items list is empty', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);

    renderPage();

    expect(await screen.findByTestId('empty-notifications')).toBeInTheDocument();
  });

  it('renders notification items when present', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        items: [makeItem('n1'), makeItem('n2', { type: 'task_commented' })],
        unreadCount: 2,
        nextCursor: null,
      },
    } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('notifications-page-list')).toBeInTheDocument();
    });

    expect(screen.getByTestId('notification-item-n1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-n2')).toBeInTheDocument();
  });

  it('renders "Tümünü okundu işaretle" button when unreadCount > 0', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 1, nextCursor: null },
    } as never);

    renderPage();

    expect(await screen.findByTestId('page-mark-all-read')).toBeInTheDocument();
  });

  it('does NOT render "Tümünü okundu işaretle" button when unreadCount === 0', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);

    renderPage();

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/notifications');
    });

    expect(screen.queryByTestId('page-mark-all-read')).not.toBeInTheDocument();
  });
});
