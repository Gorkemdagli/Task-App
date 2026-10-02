import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useProfile } from '@/hooks/queries/useProfile';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { useUiStore } from '@/stores/uiStore';

const teams: Array<{ id: string; name: string; tenantId: string; photoUrl: string | null }> = [
  { id: 'z-team', name: 'Z Takımı', tenantId: 't1', photoUrl: null },
  { id: 'a-team', name: 'A Takımı', tenantId: 't1', photoUrl: null },
];
const members = [
  { userId: 'member-1', fullName: 'Ada Yılmaz', displayId: 'A3X9K', avatarUrl: null },
  { userId: 'member-2', fullName: 'Can Demir', displayId: 'C7Y4M', avatarUrl: null },
];

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: teams, isLoading: false, isError: false }),
  useTeam: (id?: string) => ({
    data: teams.find((team) => team.id === id)
      ? { ...teams.find((team) => team.id === id), members }
      : null,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/queries/useProfile', () => ({ useProfile: vi.fn(() => ({ data: undefined })) }));

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
    teams[0].photoUrl = null;
    teams[1].photoUrl = null;
    vi.mocked(useProfile).mockReset().mockReturnValue({ data: undefined } as ReturnType<typeof useProfile>);
    useAuthStore.setState({ accessToken: 't', user });
    useTeamStore.setState({ activeTeamId: null, _hasHydrated: true });
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

  it('changes active team from the sidebar team dropdown', async () => {
    useTeamStore.setState({ activeTeamId: 'a-team', _hasHydrated: true });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Aktif takımı değiştir' }));
    await user.click(screen.getByRole('menuitem', { name: /Z Takımı/ }));

    await waitFor(() => expect(useTeamStore.getState().activeTeamId).toBe('z-team'));
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
    expect(screen.getByText('TF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kenar çubuğunu genişlet' })).toBeInTheDocument();
  });

  it('shows tenant initials when no logo is available', () => {
    useAuthStore.setState({
      accessToken: 't',
      user: { ...user, tenantName: 'Gorkem Company' },
    });
    useUiStore.setState({ sidebarCollapsed: true });
    renderSidebar();

    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.queryByText('TF')).not.toBeInTheDocument();
  });

  it('uses the profile tenant name when the auth user has no tenant name', () => {
    vi.mocked(useProfile).mockReturnValue({
      data: { tenantName: 'Gorkem Company', tenantLogoUrl: null },
    } as ReturnType<typeof useProfile>);
    useUiStore.setState({ sidebarCollapsed: true });
    renderSidebar();
    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.queryByText('TF')).not.toBeInTheDocument();
  });

  it('shows tenant logo, selected team initials, team icon, and member avatars vertically when collapsed', () => {
    useAuthStore.setState({
      accessToken: 't',
      user: { ...user, tenantName: 'Acme', tenantLogoUrl: 'https://cdn.test/acme.webp' },
    });
    useTeamStore.setState({ activeTeamId: 'a-team', _hasHydrated: true });
    useUiStore.setState({ sidebarCollapsed: true });
    const originalImage = window.Image;
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: class MockImage {
        complete = true;
        naturalWidth = 1;
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      },
    });
    try {
      const { container } = renderSidebar();

      const logo = screen.getByAltText('Acme');
      const teamAvatar = screen.getByRole('img', { name: 'A Takımı profil fotoğrafı' });
      const teamIcon = screen.getByRole('img', { name: 'A Takımı' });
      const memberList = container.querySelector('aside ul');
      const content = container.querySelector('aside > div');
      expect(logo).toHaveAttribute('src', 'https://cdn.test/acme.webp');
      expect(screen.getByText('AT')).toBeInTheDocument();
      expect(teamIcon).toBeInTheDocument();
      expect(memberList).toHaveClass('flex-col');
      expect(
        Array.from(memberList!.children).map((member) => member.getAttribute('title')),
      ).toEqual(['Ada Yılmaz', 'Can Demir']);
      expect(content).toHaveClass('overflow-y-auto');
      expect(content?.children[1]).toBe(teamAvatar);
      expect(content?.children[2]).toBe(teamIcon);
      expect(content?.children[3]?.tagName).toBe('svg');
      expect(content?.children[4]).toBe(memberList);
    } finally {
      Object.defineProperty(window, 'Image', { configurable: true, value: originalImage });
    }
  });

  it('shows selected team photo above the team icon when available', () => {
    teams[1].photoUrl = 'https://cdn.test/team.webp';
    useTeamStore.setState({ activeTeamId: 'a-team', _hasHydrated: true });
    useUiStore.setState({ sidebarCollapsed: true });
    const originalImage = window.Image;
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: class MockImage {
        complete = true;
        naturalWidth = 1;
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      },
    });
    try {
      renderSidebar();
      expect(screen.getByAltText('A Takımı')).toHaveAttribute('src', 'https://cdn.test/team.webp');
      expect(screen.getByRole('img', { name: 'A Takımı profil fotoğrafı' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'Image', { configurable: true, value: originalImage });
    }
  });
});
