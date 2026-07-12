import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';

// Sidebar now fetches live data via React Query. Stub the hooks so this
// component-level test focuses on chrome (tenant header, collapse button)
// rather than team data shape (covered by integration/manual tests).
vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: [], isLoading: false, isError: false }),
  useTeam: () => ({ data: null, isLoading: false, isError: false }),
}));

const user: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada Yılmaz',
  role: 'companyAdmin',
  tenantId: 't1',
};

describe('Sidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user });
    useUiStore.setState({ sidebarCollapsed: false });
  });

  function renderSidebar() {
    return render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
  }

  it('renders tenant header', () => {
    renderSidebar();
    expect(screen.getByText('TaskFlow Şirketim')).toBeInTheDocument();
    expect(screen.getByText('Şirket Admini')).toBeInTheDocument();
  });

  it('renders empty-state hint when no active team is set', () => {
    renderSidebar();
    expect(screen.getByText(/Üyeleri görmek için bir takım seç/)).toBeInTheDocument();
  });

  it('collapse button toggles ui store', async () => {
    const ev = userEvent.setup();
    renderSidebar();
    const btn = screen.getByRole('button', { name: 'Kenar çubuğunu daralt' });
    await ev.click(btn);
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it('renders collapsed variant when uiStore says so', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderSidebar();
    expect(screen.queryByText('TaskFlow Şirketim')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kenar çubuğunu genişlet' })).toBeInTheDocument();
  });
});
