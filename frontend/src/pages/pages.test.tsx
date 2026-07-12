import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { DashboardPage } from './Dashboard';
import { TeamsPage } from './Teams';
import { TeamDetailPage } from './TeamDetail';
import { TasksPage } from './Tasks';
import { TaskDetailPage } from './TaskDetail';
import { ChatPage } from './Chat';
import { ProfilePage } from './Profile';
import { PermissionsPage } from './Permissions';
import { CompanySettingsPage } from './CompanySettings';

// FAZ-4: Teams/TeamDetail fetch via React Query. Stub the hooks so this
// pages-level test focuses on title/render smoke rather than API contract.
vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({ data: [], isLoading: false, isError: false }),
  useTeam: () => ({ data: null, isLoading: true, isError: false }),
}));

const member: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada',
  role: 'member',
  tenantId: 't1',
};

const admin: AuthUser = { ...member, role: 'companyAdmin' };

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:id" element={<TeamDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/company/settings" element={<CompanySettingsPage />} />
          <Route path="*" element={<div>404</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('placeholder pages', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
  });

  it('Dashboard renders title', () => {
    renderAt('/dashboard');
    expect(screen.getByRole('heading', { name: 'Ana Pano' })).toBeInTheDocument();
  });

  it('Teams renders title', () => {
    renderAt('/teams');
    expect(screen.getByRole('heading', { name: 'Takımlar' })).toBeInTheDocument();
  });

  it('TeamDetail renders skeleton (data still loading)', () => {
    renderAt('/teams/abc-123');
    // Stub returns loading, so no heading from team name yet — just skeleton.
    expect(document.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('Tasks renders title', () => {
    renderAt('/tasks');
    expect(screen.getByRole('heading', { name: 'Görevlerim' })).toBeInTheDocument();
  });

  it('TaskDetail renders title and shows id param', () => {
    renderAt('/tasks/t-99');
    expect(screen.getByRole('heading', { name: 'Görev Detay' })).toBeInTheDocument();
    expect(screen.getByText('t-99')).toBeInTheDocument();
  });

  it('Chat renders title and shows id param', () => {
    renderAt('/chat/c-7');
    expect(screen.getByRole('heading', { name: 'Mesajlaşma' })).toBeInTheDocument();
    expect(screen.getByText('c-7')).toBeInTheDocument();
  });

  it('Profile renders title and shows current user email', () => {
    renderAt('/profile');
    expect(screen.getByRole('heading', { name: 'Profil' })).toBeInTheDocument();
    expect(screen.getByText('a@x.com')).toBeInTheDocument();
  });
});

describe('role-guarded pages', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 't', user: member });
  });

  it('Permissions redirects member to /dashboard', () => {
    renderAt('/permissions');
    expect(screen.queryByRole('heading', { name: 'Yetkiler' })).not.toBeInTheDocument();
  });

  it('CompanySettings redirects member to /dashboard', () => {
    renderAt('/company/settings');
    expect(screen.queryByRole('heading', { name: 'Şirket Ayarları' })).not.toBeInTheDocument();
  });

  it('Permissions renders for companyAdmin', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderAt('/permissions');
    expect(screen.getByRole('heading', { name: 'Yetkiler' })).toBeInTheDocument();
  });

  it('CompanySettings renders for companyAdmin', () => {
    useAuthStore.setState({ accessToken: 't', user: admin });
    renderAt('/company/settings');
    expect(screen.getByRole('heading', { name: 'Şirket Ayarları' })).toBeInTheDocument();
  });
});
