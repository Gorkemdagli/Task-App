import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { PermissionsPage } from './index';

const mutateAsync = vi.fn();
const user = {
  id: 'user-b',
  displayId: 'B1234',
  email: 'b@example.com',
  fullName: 'User B',
  avatarUrl: null,
  role: 'member' as const,
  teamRoles: [],
};

vi.mock('@/hooks/queries/useCompanyUsers', () => ({
  useCompanyUsers: () => ({ data: [user], isLoading: false, isError: false }),
  useUpdateCompanyRole: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useUpdateCompanyPermissions: () => ({
    mutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({
    data: [
      { id: 'team-a', name: 'Alpha' },
      { id: 'team-b', name: 'Beta' },
    ],
    isLoading: false,
    isError: false,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PermissionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PermissionsPage', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(user);
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'admin',
        displayId: 'ADMIN',
        email: 'admin@example.com',
        fullName: 'Admin',
        role: 'companyAdmin',
        tenantId: 'tenant-a',
        tenantName: 'Acme',
      },
    });
  });

  it('shows row actions only after a draft change and confirms before saving', async () => {
    const u = userEvent.setup();
    renderPage();

    await u.click(screen.getByRole('button', { name: 'User B rolü' }));
    await u.click(screen.getByRole('menuitem', { name: 'Şirket Admini' }));

    expect(screen.getByTestId('permission-cancel-user-b')).toBeInTheDocument();
    await u.click(screen.getByTestId('permission-save-user-b'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Emin misiniz?');
    expect(mutateAsync).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(mutateAsync).toHaveBeenCalledWith({
      userId: 'user-b',
      role: 'companyAdmin',
      teamRoles: [],
    });
  });

  it('stages multiple team admin assignments in one row', async () => {
    const u = userEvent.setup();
    renderPage();

    await u.click(screen.getByRole('button', { name: 'User B takım yetkileri' }));
    await u.click(screen.getByRole('menuitem', { name: 'Alpha — Takım Admini' }));
    await u.click(screen.getByRole('button', { name: 'User B takım yetkileri' }));
    await u.click(screen.getByRole('menuitem', { name: 'Beta — Takım Admini' }));

    expect(screen.getByTestId('permission-save-user-b')).toBeInTheDocument();
    await u.click(screen.getByTestId('permission-save-user-b'));
    await u.click(screen.getByRole('button', { name: 'Onayla' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      userId: 'user-b',
      role: 'member',
      teamRoles: [
        { teamId: 'team-a', role: 'teamAdmin' },
        { teamId: 'team-b', role: 'teamAdmin' },
      ],
    });
  });

  it('cancels the row draft without saving', async () => {
    const u = userEvent.setup();
    renderPage();

    await u.click(screen.getByRole('button', { name: 'User B rolü' }));
    await u.click(screen.getByRole('menuitem', { name: 'Şirket Admini' }));
    await u.click(screen.getByTestId('permission-cancel-user-b'));

    expect(screen.queryByTestId('permission-save-user-b')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
