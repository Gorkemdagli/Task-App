import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoutCoordinatorProvider } from '@/components/auth/LogoutCoordinator';
import { AppShell } from './AppShell';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { api } from '@/lib/api';

let mockTeamsLoading = false;

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: [], isLoading: mockTeamsLoading, isError: false }),
  useTeam: () => ({ data: null, isLoading: false, isError: false }),
}));

const baseUser: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'companyAdmin',
  tenantId: 't1',
  tenantName: 'Acme A.Ş.',
};

function renderWithRouter(initialPath = '/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LogoutCoordinatorProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div data-testid="child">içerik</div>} />
            </Route>
          </Routes>
        </LogoutCoordinatorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    mockTeamsLoading = false;
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/users/me/company-invitations') {
        return { data: { invitations: [], pendingCount: 0 } } as never;
      }
      return { data: { items: [], unreadCount: 0, nextCursor: null } } as never;
    });
  });

  it('renders Topbar + Sidebar + main with children', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();
    expect(screen.getByText('Task', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Flow', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Acme A.Ş.')).toBeInTheDocument(); // sidebar tenant header
    expect(screen.getByTestId('child')).toHaveTextContent('içerik');
  });

  it('topbar nav includes the dashboard link', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();
    const link = screen.getByRole('link', { name: 'Ana Pano' });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('keeps the sidebar fixed while the content area owns vertical scrolling', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();

    expect(screen.getByTestId('app-shell')).toHaveClass('h-screen', 'overflow-hidden');
    expect(screen.getByRole('complementary', { name: 'Yan menü' })).toHaveClass('h-full');
    expect(screen.getByRole('main')).toHaveClass('min-h-0', 'min-w-0', 'overflow-y-auto');
  });

  it('keeps the shell visible while a destination route is suspended', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    const pending = new Promise<void>(() => {});
    function SuspendedDestination(): never {
      throw pending;
    }

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 0 } } })}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <LogoutCoordinatorProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<SuspendedDestination />} />
              </Route>
            </Routes>
          </LogoutCoordinatorProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
  });

  it('announces sidebar team loading without visible loading text', async () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    mockTeamsLoading = true;
    renderWithRouter();

    const trigger = screen.getAllByRole('button').find((button) => button.getAttribute('aria-label')?.includes('tak'))!;
    await userEvent.click(trigger);

    const status = screen.getByRole('status');
    expect(status).toHaveClass('sr-only');
  });
});
