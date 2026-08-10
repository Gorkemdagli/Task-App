import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { useUiStore } from '@/stores/uiStore';

const teams = [
  { id: 'z-team', name: 'Z Takımı', tenantId: 't1' },
  { id: 'a-team', name: 'A Takımı', tenantId: 't1' },
];

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: teams, isLoading: false, isError: false }),
  useTeam: (id?: string) => ({
    data: teams.find((team) => team.id === id)
      ? { ...teams.find((team) => team.id === id), members: [] }
      : null,
    isLoading: false,
    isError: false,
  }),
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
    useTeamStore.setState({ activeTeamId: null, _hasHydrated: true });
    useUiStore.setState({ sidebarCollapsed: false });
  });

  function renderSidebar() {
    return render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar />
      </MemoryRouter>,
    );
  }

  it('renders tenant header', () => {
    renderSidebar();
    expect(screen.getByText('TaskFlow Şirketim')).toBeInTheDocument();
    expect(screen.getByText('Şirket Admini')).toBeInTheDocument();
  });

  it('selects alphabetically first team when no active team is set', async () => {
    renderSidebar();
    await waitFor(() => expect(useTeamStore.getState().activeTeamId).toBe('a-team'));
    expect(screen.getByText('A Takımı')).toBeInTheDocument();
  });

  it('keeps valid active team selection', async () => {
    useTeamStore.setState({ activeTeamId: 'z-team', _hasHydrated: true });
    renderSidebar();
    await waitFor(() => expect(useTeamStore.getState().activeTeamId).toBe('z-team'));
    expect(screen.getByText('Z Takımı')).toBeInTheDocument();
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
