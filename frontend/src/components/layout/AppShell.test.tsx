import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { api } from '@/lib/api';

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: [], isLoading: false, isError: false }),
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
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[initialPath]}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<div data-testid="child">içerik</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);
  });

  it('renders Topbar + Sidebar + main with children', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();
    expect(screen.getByText('TaskFlow')).toBeInTheDocument(); // logo
    expect(screen.getByText('Acme A.Ş.')).toBeInTheDocument(); // sidebar tenant header
    expect(screen.getByTestId('child')).toHaveTextContent('içerik');
  });

  it('topbar nav includes the dashboard link', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();
    const link = screen.getByRole('link', { name: 'Ana Pano' });
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
