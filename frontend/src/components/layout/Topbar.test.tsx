import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Topbar } from './Topbar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUiStore } from '@/stores/uiStore';
import { api } from '@/lib/api';

const member: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'member',
  tenantId: 't1',
  tenantName: 'Acme A.Ş.',
};

const admin: AuthUser = { ...member, role: 'companyAdmin' };

function renderTopbar(initialUser: AuthUser | null, qc?: QueryClient) {
  if (initialUser) {
    useAuthStore.setState({ accessToken: 't', user: initialUser });
  } else {
    useAuthStore.setState({ accessToken: null, user: null });
  }
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Topbar />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('Topbar', () => {
  let getSpy: MockInstance;

  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark', _hasHydrated: true });
    useUiStore.setState({ mobileSheetOpen: false });
    document.documentElement.removeAttribute('data-theme');
    getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('renders logo and primary nav links', () => {
    renderTopbar(member);
    expect(screen.getByRole('link', { name: 'TaskFlow' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Ana Pano' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Takımlar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Görevler' })).toBeInTheDocument();
  });

  it('hides /permissions link for member role', () => {
    renderTopbar(member);
    expect(screen.queryByRole('link', { name: 'Yetkiler' })).not.toBeInTheDocument();
  });

  it('shows /permissions link for companyAdmin role', () => {
    renderTopbar(admin);
    expect(screen.getByRole('link', { name: 'Yetkiler' })).toBeInTheDocument();
  });

  it('shows avatar with initials from full name', () => {
    renderTopbar(member);
    // Full name "Ada Yılmaz" → initials "AY"
    expect(screen.getByText('AY')).toBeInTheDocument();
  });

  it('renders a bell button (placeholder) and theme toggle', () => {
    renderTopbar(member);
    expect(screen.getByRole('button', { name: /Bildirimler/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Karanlık temaya geç|Aydınlık temaya geç/ }),
    ).toBeInTheDocument();
  });

  it('theme toggle flips store + DOM attribute', async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ mode: 'dark', _hasHydrated: true });
    renderTopbar(member);
    const btn = screen.getByRole('button', { name: /Aydınlık temaya geç|Karanlık temaya geç/ });
    await user.click(btn);
    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('hamburger button opens the mobile sheet store', async () => {
    const user = userEvent.setup();
    renderTopbar(member);
    const menu = screen.getByRole('button', { name: 'Menüyü aç' });
    await user.click(menu);
    expect(useUiStore.getState().mobileSheetOpen).toBe(true);
  });
});

describe('Topbar notification bell', () => {
  let getSpy: MockInstance;
  let patchSpy: MockInstance;

  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
    getSpy = vi.spyOn(api, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
    patchSpy?.mockRestore();
  });

  it('renders notification badge when unreadCount > 0', async () => {
    getSpy.mockResolvedValue({
      data: { items: [], unreadCount: 3, nextCursor: null },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    renderTopbar(member, qc);

    await waitFor(() => {
      expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');
    });
  });

  it('does not render badge when unreadCount === 0', async () => {
    getSpy.mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    renderTopbar(member, qc);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/notifications?limit=10');
    });
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('does not mark all notifications read when bell opens', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [
          {
            id: 'n1',
            type: 'task_assigned',
            payload: { taskId: 'task-1', taskTitle: 'GÃ¶rev' },
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
        nextCursor: null,
      },
    } as never);
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: null } as never);
    renderTopbar(member);

    await userEvent.click(await screen.findByTestId('notification-bell'));
    expect(patchSpy).not.toHaveBeenCalledWith('/notifications/read-all');
  });

  it('marks unread task notification read then navigates to task', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [
          {
            id: 'n1',
            type: 'task_assigned',
            payload: { taskId: 'task-1', taskTitle: 'GÃ¶rev' },
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
        nextCursor: null,
      },
    } as never);
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: null } as never);
    renderTopbar(member);

    await userEvent.click(await screen.findByTestId('notification-bell'));
    await userEvent.click(await screen.findByTestId('notification-item-n1'));
    expect(patchSpy).toHaveBeenCalledWith('/notifications/n1/read');
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks/task-1');
  });

  it('navigates read task notification without single-read PATCH', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [
          {
            id: 'n1',
            type: 'task_assigned',
            payload: { taskId: 'task-1', taskTitle: 'GÃ¶rev' },
            readAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 0,
        nextCursor: null,
      },
    } as never);
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: null } as never);
    renderTopbar(member);

    await userEvent.click(await screen.findByTestId('notification-bell'));
    await userEvent.click(await screen.findByTestId('notification-item-n1'));
    expect(patchSpy).not.toHaveBeenCalledWith('/notifications/n1/read');
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks/task-1');
  });

  it('marks all notifications read from panel action', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [
          {
            id: 'n1',
            type: 'task_assigned',
            payload: { taskId: 'task-1', taskTitle: 'GÃ¶rev' },
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
        nextCursor: null,
      },
    } as never);
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: null } as never);
    renderTopbar(member);

    await userEvent.click(await screen.findByTestId('notification-bell'));
    await userEvent.click(screen.getByTestId('mark-all-read'));
    expect(patchSpy).toHaveBeenCalledWith('/notifications/read-all');
  });

  it('drops previous user notifications when auth user changes', async () => {
    getSpy
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'old',
              type: 'task_assigned',
              payload: { taskId: 't1', taskTitle: 'Eski görev', actorName: 'Eski Kullanıcı' },
              readAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
          unreadCount: 1,
          nextCursor: null,
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'new',
              type: 'task_assigned',
              payload: { taskId: 't2', taskTitle: 'Yeni görev', actorName: 'Yeni Kullanıcı' },
              readAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
          unreadCount: 1,
          nextCursor: null,
        },
      } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const view = renderTopbar(member, qc);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('notification-bell'));
    expect(await screen.findByText(/Eski Kullanıcı/)).toBeInTheDocument();
    await user.keyboard('{Escape}');

    act(() => {
      useAuthStore.setState({
        accessToken: 't2',
        user: { ...member, id: '2', fullName: 'Bora Kaya', email: 'b@x.com' },
      });
      qc.clear();
    });
    view.rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Topbar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId('notification-bell'));
    expect(await screen.findByText(/Yeni Kullanıcı/)).toBeInTheDocument();
    expect(screen.queryByText(/Eski Kullanıcı/)).not.toBeInTheDocument();
  });
});
