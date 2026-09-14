import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { CompanyUser } from '@/services/companyUsers';
import { PermissionsPage } from './index';

const state = vi.hoisted(() => ({
  users: [] as CompanyUser[] | undefined,
  teams: [
    { id: 'team-a', name: 'Alpha' },
    { id: 'team-b', name: 'Beta' },
  ],
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  usersQuery: {
    isLoading: false,
    isError: false,
    isFetching: false,
  },
  teamsQuery: {
    isLoading: false,
    isError: false,
  },
}));

function makeUser(overrides: Partial<CompanyUser> = {}): CompanyUser {
  return {
    id: 'user-b',
    displayId: 'B1234',
    email: 'b@example.com',
    fullName: 'User B',
    avatarUrl: null,
    role: 'member',
    teamRoles: [],
    ...overrides,
  };
}

const currentUser = makeUser({
  id: 'admin',
  displayId: 'ADMIN',
  email: 'admin@example.com',
  fullName: 'Admin',
  role: 'companyAdmin',
  teamRoles: [{ teamId: 'team-a', teamName: 'Alpha', role: 'member' }],
});

vi.mock('@/hooks/queries/useCompanyUsers', () => ({
  useCompanyUsers: () => ({
    data: state.users,
    ...state.usersQuery,
    refetch: state.refetch,
  }),
  useUpdateCompanyPermissions: () => ({
    mutateAsync: state.mutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: () => ({
    data: state.teams,
    ...state.teamsQuery,
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
    state.users = [currentUser, makeUser()];
    state.teams = [
      { id: 'team-a', name: 'Alpha' },
      { id: 'team-b', name: 'Beta' },
    ];
    state.mutateAsync.mockReset();
    state.mutateAsync.mockResolvedValue(state.users?.[1]);
    state.refetch.mockReset();
    state.usersQuery.isLoading = false;
    state.usersQuery.isError = false;
    state.usersQuery.isFetching = false;
    state.teamsQuery.isLoading = false;
    state.teamsQuery.isError = false;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the audit ledger and an empty inspector until a user is selected', () => {
    renderPage();

    expect(screen.getByTestId('permissions-page')).toHaveClass(
      'mx-auto',
      'w-full',
      'max-w-6xl',
      'space-y-6',
    );
    expect(screen.getByRole('heading', { name: 'Yetkiler' })).toBeInTheDocument();
    expect(screen.getByText('2 kullanıcı')).toBeInTheDocument();
    expect(screen.getByText('Kullanıcı yetkilerini incelemek için bir kullanıcı seçin.')).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Kullanıcı defteri' })).toBeInTheDocument();
  });

  it('selects one user and keeps the actor row editable only for inspection', async () => {
    const u = userEvent.setup();
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    expect(screen.getByRole('heading', { name: 'User B' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Şirket rolü' })).toHaveValue('member');
    expect(screen.getByRole('combobox', { name: 'Alpha rolü' })).toHaveValue('none');

    await u.click(within(screen.getByRole('listbox', { name: 'Kullanıcı defteri' })).getByRole('option', { name: /^Admin,/ }));
    expect(screen.getByText('Kendi rolünüzü değiştiremezsiniz.', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Şirket rolü' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Alpha rolü' })).toBeDisabled();
  });

  it('filters the full user set before paginating ten rows', async () => {
    const u = userEvent.setup();
    state.users = Array.from({ length: 12 }, (_, index) =>
      makeUser({
        id: `user-${index}`,
        displayId: `U${index}`,
        email: `user-${index}@example.com`,
        fullName: `User ${index}`,
        role: index === 10 ? 'companyAdmin' : 'member',
        teamRoles:
          index === 10
            ? [{ teamId: 'team-a', teamName: 'Alpha', role: 'teamAdmin' }]
            : [],
      }),
    );
    renderPage();

    expect(within(screen.getByRole('listbox', { name: 'Kullanıcı defteri' })).getAllByRole('option')).toHaveLength(10);
    expect(screen.getByText('Sayfa 1 / 2')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Sonraki sayfa' }));
    expect(screen.getByRole('option', { name: /User 10/ })).toBeInTheDocument();

    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü filtresi' }), 'companyAdmin');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Takım filtresi' }), 'team-a');
    expect(within(screen.getByRole('listbox', { name: 'Kullanıcı defteri' })).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /User 10/ })).toBeInTheDocument();
    expect(screen.getByText(/1 kullanıcı · sayfa başına/)).toBeInTheDocument();
  });

  it('guards a draft before changing the selected user', async () => {
    const u = userEvent.setup();
    const confirm = vi.mocked(window.confirm);
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    confirm.mockReturnValueOnce(false);
    await u.click(within(screen.getByRole('listbox', { name: 'Kullanıcı defteri' })).getByRole('option', { name: /^Admin,/ }));
    expect(screen.getByRole('heading', { name: 'User B' })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('Kaydedilmemiş değişiklikler var. Bu değişiklikleri iptal edip devam etmek ister misiniz?');

    confirm.mockReturnValueOnce(true);
    await u.click(within(screen.getByRole('listbox', { name: 'Kullanıcı defteri' })).getByRole('option', { name: /^Admin,/ }));
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('shows an old-to-new diff and sends one atomic update', async () => {
    const u = userEvent.setup();
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Alpha rolü' }), 'teamAdmin');
    await u.click(screen.getByRole('button', { name: 'Değişiklikleri İncele' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Üye → Şirket Admini');
    expect(dialog).toHaveTextContent('Alpha: Yok → Takım Admini');
    expect(state.mutateAsync).not.toHaveBeenCalled();

    await u.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));
    expect(state.mutateAsync).toHaveBeenCalledWith({
      userId: 'user-b',
      role: 'companyAdmin',
      teamRoles: [{ teamId: 'team-a', role: 'teamAdmin' }],
    });
  });

  it('retains the inspector draft after a save failure', async () => {
    const u = userEvent.setup();
    state.mutateAsync.mockRejectedValueOnce(new Error('nope'));
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    await u.click(screen.getByRole('button', { name: 'Değişiklikleri İncele' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Değişiklikleri Kaydet' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Yetkiler güncellenemedi.');
    expect(screen.getByRole('combobox', { name: 'Şirket rolü' })).toHaveValue('companyAdmin');
    expect(screen.getByRole('button', { name: 'Değişiklikleri İptal Et' })).toBeInTheDocument();
  });

  it('does not lose a draft when search would hide the selected user', async () => {
    const u = userEvent.setup();
    const confirm = vi.mocked(window.confirm);
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    confirm.mockReturnValue(false);
    await u.type(screen.getByRole('textbox', { name: 'Kullanıcı ara' }), 'Z');

    expect(screen.getByRole('heading', { name: 'User B' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Şirket rolü' })).toHaveValue('companyAdmin');
    expect(screen.getByRole('textbox', { name: 'Kullanıcı ara' })).toHaveValue('');
  });

  it('disables every editor while team data is unavailable and preserves assigned roles', async () => {
    const u = userEvent.setup();
    state.users = [makeUser({ teamRoles: [{ teamId: 'team-a', teamName: 'Alpha', role: 'teamAdmin' }] })];
    state.teamsQuery.isError = true;
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    expect(screen.getByRole('combobox', { name: 'Şirket rolü' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Alpha rolü' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Alpha rolü' })).toHaveValue('teamAdmin');
    expect(screen.getByText(/mevcut roller korunuyor/)).toBeInTheDocument();
  });

  it('blocks review and save when team data becomes unavailable', async () => {
    const u = userEvent.setup();
    const view = renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    expect(screen.getByRole('button', { name: 'Değişiklikleri İncele' })).toBeEnabled();
    await u.click(screen.getByRole('button', { name: 'Değişiklikleri İncele' }));

    state.teamsQuery.isError = true;
    await act(async () => {
      view.rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <PermissionsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const dialog = screen.getByRole('dialog');
    const saveButton = within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' });
    expect(saveButton).toBeDisabled();
    await u.click(saveButton);
    expect(state.mutateAsync).not.toHaveBeenCalled();

    await u.click(within(dialog).getByRole('button', { name: 'İptal' }));
    expect(screen.getByRole('button', { name: 'Değişiklikleri İncele' })).toBeDisabled();
  });

  it('blocks review and save when loaded team data omits an assigned team', async () => {
    const u = userEvent.setup();
    state.users = [
      currentUser,
      makeUser({ teamRoles: [{ teamId: 'team-a', teamName: 'Alpha', role: 'teamAdmin' }] }),
    ];
    const view = renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    await u.click(screen.getByRole('button', { name: 'Değişiklikleri İncele' }));

    state.teams = [{ id: 'team-b', name: 'Beta' }];
    await act(async () => {
      view.rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <PermissionsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const dialog = screen.getByRole('dialog');
    const saveButton = within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' });
    expect(saveButton).toBeDisabled();
    await u.click(saveButton);
    expect(state.mutateAsync).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole('button', { name: 'İptal' }));
    expect(screen.getByRole('combobox', { name: 'Şirket rolü' })).toBeDisabled();
  });

  it('restores rejected role and team filter values', async () => {
    const u = userEvent.setup();
    const confirm = vi.mocked(window.confirm);
    renderPage();

    await u.click(screen.getByRole('option', { name: /User B/ }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Şirket rolü' }), 'companyAdmin');
    confirm.mockReturnValue(false);

    const roleFilter = screen.getByRole('combobox', { name: 'Şirket rolü filtresi' });
    await u.selectOptions(roleFilter, 'companyAdmin');
    expect(roleFilter).toHaveValue('');

    const teamFilter = screen.getByRole('combobox', { name: 'Takım filtresi' });
    await u.selectOptions(teamFilter, 'team-a');
    expect(teamFilter).toHaveValue('');
  });

  it('shows retry and empty states without a central spinner', () => {
    state.users = undefined;
    state.usersQuery.isLoading = true;
    const view = renderPage();
    expect(screen.getByTestId('permissions-loading')).toBeInTheDocument();
    expect(screen.queryByText('Yükleniyor…')).not.toBeInTheDocument();

    state.usersQuery.isLoading = false;
    state.usersQuery.isError = true;
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PermissionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Kullanıcılar yüklenemedi.');
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
  });
});
