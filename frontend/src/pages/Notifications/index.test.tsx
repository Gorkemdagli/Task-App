import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      expect(getSpy).toHaveBeenCalledWith(
        '/notifications?limit=10',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
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
      expect(getSpy).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('page-mark-all-read')).not.toBeInTheDocument();
  });

  it('renders date group headers Bugün / Dün / dd.MM.yyyy', async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(today.getDate() - 5);

    const fmt = (d: Date) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}.${month}.${d.getFullYear()}`;
    };

    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        items: [
          makeItem('today', { createdAt: today.toISOString() }),
          makeItem('yest', { createdAt: yesterday.toISOString() }),
          makeItem('old', { createdAt: fiveDaysAgo.toISOString() }),
        ],
        unreadCount: 0,
        nextCursor: null,
      },
    } as never);

    renderPage();

    expect(await screen.findByText('Bugün')).toBeInTheDocument();
    expect(screen.getByText('Dün')).toBeInTheDocument();
    expect(screen.getByText(fmt(fiveDaysAgo))).toBeInTheDocument();
  });

  it('disables Prev on first page', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 0, nextCursor: 'C2' },
    } as never);

    renderPage();

    const prev = await screen.findByTestId('page-prev');
    expect(prev).toBeDisabled();
  });

  it('disables Next when nextCursor is null', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 0, nextCursor: null },
    } as never);

    renderPage();

    const next = await screen.findByTestId('page-next');
    expect(next).toBeDisabled();
  });

  it('fetches next page with cursor when Next is clicked', async () => {
    getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1')], unreadCount: 0, nextCursor: 'C2' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 1: no more pages
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p2-n1')], unreadCount: 0, nextCursor: null },
      } as never);

    const user = userEvent.setup();
    renderPage();

    const next = await screen.findByTestId('page-next');
    await user.click(next);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        '/notifications?limit=10&cursor=C2',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByTestId('notification-item-p2-n1')).toBeInTheDocument();
  });

  it('returns to previous page when Prev is clicked after Next', async () => {
    getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1')], unreadCount: 0, nextCursor: 'C2' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 1 → null (no further pages discovered before click)
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p2-n1')], unreadCount: 0, nextCursor: 'C3' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 2 → null
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1-again')], unreadCount: 0, nextCursor: 'C2' },
      } as never);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('page-next'));
    await screen.findByTestId('notification-item-p2-n1');

    await user.click(screen.getByTestId('page-prev'));
    expect(await screen.findByTestId('notification-item-p1-n1-again')).toBeInTheDocument();
  });

  it('renders one page-number button per page discovered, active page highlighted', async () => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 0, nextCursor: null },
    } as never);

    renderPage();

    const btn1 = await screen.findByTestId('page-num-1');
    expect(btn1).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('page-num-1')).toBeInTheDocument();
    expect(screen.queryByTestId('page-num-2')).not.toBeInTheDocument();
  });

  it('walks forward on mount to discover all pages', async () => {
    // Mount → page 1 (C2) → walk C2 → walk C3 → walk null.
    // User never clicks anything; walk must populate cursors=[C2,C3] and render 3 buttons.
    getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1')], unreadCount: 0, nextCursor: 'C2' },
      } as never)
      .mockResolvedValueOnce({
        // walk from C2 → discover C3
        data: { items: [], unreadCount: 0, nextCursor: 'C3' },
      } as never)
      .mockResolvedValueOnce({
        // walk from C3 → null (end)
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never);

    renderPage();

    expect(await screen.findByTestId('page-num-1')).toBeInTheDocument();
    expect(await screen.findByTestId('page-num-2')).toBeInTheDocument();
    expect(await screen.findByTestId('page-num-3')).toBeInTheDocument();
    expect(screen.queryByTestId('page-num-4')).not.toBeInTheDocument();
  });

  it('renders second page button after Next is clicked', async () => {
    getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1')], unreadCount: 0, nextCursor: 'C2' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 1 → discover C3
        data: { items: [], unreadCount: 0, nextCursor: 'C3' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 2 → null
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p2-n1')], unreadCount: 0, nextCursor: 'C3' },
      } as never);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('page-next'));
    await screen.findByTestId('notification-item-p2-n1');

    expect(screen.getByTestId('page-num-1')).toBeInTheDocument();
    expect(screen.getByTestId('page-num-2')).toBeInTheDocument();
    expect(screen.getByTestId('page-num-2')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('page-num-1')).not.toHaveAttribute('aria-current');
  });

  it('navigates to a specific page when its number button is clicked', async () => {
    getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1')], unreadCount: 0, nextCursor: 'C2' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 1 → null
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p2-n1')], unreadCount: 0, nextCursor: 'C3' },
      } as never)
      .mockResolvedValueOnce({
        // walk from page 2 → null
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('p1-n1-back')], unreadCount: 0, nextCursor: 'C2' },
      } as never);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('page-next'));
    await screen.findByTestId('notification-item-p2-n1');

    await user.click(screen.getByTestId('page-num-1'));
    expect(await screen.findByTestId('notification-item-p1-n1-back')).toBeInTheDocument();
  });
});
