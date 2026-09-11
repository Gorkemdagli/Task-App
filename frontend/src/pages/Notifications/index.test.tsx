import { describe, expect, it, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsPage } from './index';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { api } from '@/lib/api';
import * as companyInvitationsService from '@/services/companyInvitations';
import type { NotificationItem as NotificationItemType } from '@/hooks/useNotifications';

vi.mock('@/services/companyInvitations', () => ({
  listMyCompanyInvitations: vi.fn(),
  acceptCompanyInvitation: vi.fn(),
  rejectCompanyInvitation: vi.fn(),
}));

const member: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'member',
  tenantId: 't1',
  tenantName: 'Acme A.Ş.',
};

const tenantless: AuthUser = { ...member, id: 'tenantless-user', tenantId: null };

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

function makeItem(id: string, overrides: Partial<NotificationItemType> = {}): NotificationItemType {
  return {
    id,
    type: 'task_assigned',
    payload: { taskId: `task-${id}`, taskTitle: `Task ${id}`, actorName: 'Ayşe' },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as NotificationItemType;
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationsPage', () => {
  let getSpy: MockInstance;
  let patchSpy: MockInstance;

  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
    vi.mocked(companyInvitationsService.listMyCompanyInvitations).mockResolvedValue([]);
    vi.mocked(companyInvitationsService.acceptCompanyInvitation).mockReset();
    vi.mocked(companyInvitationsService.rejectCompanyInvitation).mockReset();
    getSpy = vi.spyOn(api, 'get');
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: null } as never);
  });

  afterEach(() => {
    getSpy.mockRestore();
    patchSpy.mockRestore();
  });

  it('fetches only first page on mount', async () => {
    getSpy.mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 1, nextCursor: 'C2' },
    } as never);
    renderPage();

    await screen.findByTestId('notification-item-n1');
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('/notifications?limit=10');
  });

  it('loads next page only after Daha fazla click', async () => {
    getSpy
      .mockResolvedValueOnce({
        data: { items: [makeItem('n1')], unreadCount: 2, nextCursor: 'C2' },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [makeItem('n2')], unreadCount: 2, nextCursor: null },
      } as never);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Daha fazla' }));
    expect(await screen.findByTestId('notification-item-n2')).toBeInTheDocument();
    expect(getSpy).toHaveBeenLastCalledWith('/notifications?limit=10&cursor=C2');
  });

  it('marks unread task read then navigates', async () => {
    getSpy.mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 1, nextCursor: null },
    } as never);
    renderPage();

    await userEvent.click(await screen.findByTestId('notification-item-n1'));
    expect(patchSpy).toHaveBeenCalledWith('/notifications/n1/read');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks/task-n1'));
  });

  it('keeps read task navigation without single-read PATCH', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [makeItem('n1', { readAt: new Date().toISOString() })],
        unreadCount: 0,
        nextCursor: null,
      },
    } as never);
    renderPage();

    await userEvent.click(await screen.findByTestId('notification-item-n1'));
    expect(patchSpy).not.toHaveBeenCalledWith('/notifications/n1/read');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks/task-n1'));
  });

  it('keeps message_received passive', async () => {
    const item: NotificationItemType = {
      id: 'm1',
      type: 'message_received',
      payload: { actorName: 'Mert' },
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    getSpy.mockResolvedValue({
      data: { items: [item], unreadCount: 1, nextCursor: null },
    } as never);
    renderPage();

    const row = await screen.findByTestId('notification-item-m1');
    expect(row.tagName).toBe('DIV');
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('marks all from page action', async () => {
    getSpy.mockResolvedValue({
      data: { items: [makeItem('n1')], unreadCount: 1, nextCursor: null },
    } as never);
    renderPage();

    await userEvent.click(await screen.findByTestId('page-mark-all-read'));
    expect(patchSpy).toHaveBeenCalledWith('/notifications/read-all');
  });

  it('renders empty state', async () => {
    getSpy.mockResolvedValue({ data: { items: [], unreadCount: 0, nextCursor: null } } as never);
    renderPage();
    expect(await screen.findByTestId('empty-notifications')).toBeInTheDocument();
  });

  it('renders request error', async () => {
    getSpy.mockRejectedValue(new Error('fail'));
    renderPage();
    await screen.findByRole('alert', {}, { timeout: 15000 });
    expect(screen.getByRole('alert')).toHaveTextContent('Bildirimler yüklenemedi.');
  }, 15000);

  it('renders tenantless pending invitations with accept and reject actions', async () => {
    useAuthStore.setState({ accessToken: 't', user: tenantless });
    getSpy.mockImplementation((url) => {
      if (url === '/users/me/company-invitations') {
        return Promise.resolve({ data: { invitations: [invitation], pendingCount: 1 } } as never);
      }
      return Promise.resolve({
        data: { items: [], unreadCount: 0, nextCursor: null },
      } as never);
    });
    vi.mocked(companyInvitationsService.listMyCompanyInvitations).mockResolvedValue([invitation]);
    vi.mocked(companyInvitationsService.acceptCompanyInvitation).mockResolvedValue({
      invitation: { ...invitation, status: 'accepted' },
      user: { ...tenantless, tenantId: 'tenant-a', tenantName: 'Acme' },
    });
    renderPage();

    expect(await screen.findByTestId('company-invitation-card-invitation-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Kabul Et' }));
    expect(companyInvitationsService.acceptCompanyInvitation).toHaveBeenCalledWith(
      'invitation-1',
      expect.any(Object),
    );
  });
});
