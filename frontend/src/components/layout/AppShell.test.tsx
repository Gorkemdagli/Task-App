import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuthStore, type AuthUser } from '@/stores/authStore';

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
};

function renderWithRouter(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<div data-testid="child">içerik</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders Topbar + Sidebar + main with children', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();
    expect(screen.getByText('TaskFlow')).toBeInTheDocument(); // logo
    expect(screen.getByText('TaskFlow Şirketim')).toBeInTheDocument(); // sidebar tenant header
    expect(screen.getByTestId('child')).toHaveTextContent('içerik');
  });

  it('topbar nav includes the dashboard link', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    renderWithRouter();
    const link = screen.getByRole('link', { name: 'Ana Pano' });
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
