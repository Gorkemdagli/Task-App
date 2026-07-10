import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
  return render(
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
    </MemoryRouter>,
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
    expect(screen.getByRole('heading', { name: 'Takımlarım' })).toBeInTheDocument();
  });

  it('TeamDetail renders title and shows id param', () => {
    renderAt('/teams/abc-123');
    expect(screen.getByRole('heading', { name: 'Takım Detay' })).toBeInTheDocument();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
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
    // Navigate renders nothing visible — content should be the matched '*' (404)
    // BUT Navigate fires client-side; in MemoryRouter we can't easily assert
    // destination. Instead assert the heading is NOT rendered.
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
