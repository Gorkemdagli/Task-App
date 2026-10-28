import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserProfile } from '@/services/profile';
import { ProfilePage } from './index';
import { LogoutCoordinatorProvider } from '@/components/auth/LogoutCoordinator';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { authApi } from '@/lib/api';
import { queryClient } from '@/lib/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';

const { useProfileMock, updateMock, uploadMock, deleteMock } = vi.hoisted(() => ({
  useProfileMock: vi.fn(),
  updateMock: vi.fn(),
  uploadMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('@/hooks/queries/useProfile', () => ({
  useProfile: useProfileMock,
  useUpdateProfile: () => updateMock(),
  useUploadAvatar: () => uploadMock(),
  useDeleteAccount: () => deleteMock(),
}));

const profile: CurrentUserProfile = {
  id: 'user-1',
  displayId: 'ABCDE',
  email: 'user@example.com',
  fullName: 'Ada User',
  role: 'member',
  tenantId: null,
  tenantName: null,
  tenantLogoUrl: null,
  avatarUrl: null,
  notifyTaskAssigned: true,
  notifyTaskCommented: true,
  notifyMessageReceived: true,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/profile']}>
        <LogoutCoordinatorProvider>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<p data-testid="public-login">Sign in</p>} />
            <Route path="/" element={<p data-testid="public-landing">Public landing</p>} />
          </Routes>
        </LogoutCoordinatorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderProtectedPage() {
  useAuthStore.setState({ accessToken: 'test-token', user: profile });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile']}>
        <LogoutCoordinatorProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/protected-other" element={<p>Other protected page</p>} />
            </Route>
            <Route path="/" element={<p data-testid="public-landing">Public landing</p>} />
          </Routes>
          <ProfileTestNavigation />
          <ProfileTestLocation />
        </LogoutCoordinatorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ProfileTestNavigation() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/protected-other')}>
      Navigate away from profile
    </button>
  );
}

function ProfileTestLocation() {
  const location = useLocation();
  return <output data-testid="profile-location">{location.pathname}</output>;
}

function observeSignInRequired(container: HTMLElement) {
  const signInRequiredInsertions: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const text = node.textContent ?? '';
        if (text.includes('Bu sayfaya erişmek için giriş yapın')) {
          signInRequiredInsertions.push(text);
        }
      }
    }
  });
  observer.observe(container, { childList: true, subtree: true });
  return { signInRequiredInsertions, disconnect: () => observer.disconnect() };
}

describe('ProfilePage', () => {
  let logoutSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    useProfileMock.mockReturnValue({ data: profile, isLoading: false, isError: false });
    updateMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(profile),
      isPending: false,
      isError: false,
      error: null,
    });
    uploadMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(profile),
      isPending: false,
      isError: false,
      error: null,
    });
    deleteMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    logoutSpy?.mockRestore();
    logoutSpy = undefined;
  });

  it('shows a shared form skeleton while the profile is pending', () => {
    useProfileMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();

    expect(screen.getByTestId('page-loading-skeleton')).toHaveAttribute('data-variant', 'form');
  });

  it('renders editable profile, read-only display ID, password, and preferences', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Profil' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ad Soyad')).toHaveValue('Ada User');
    expect(screen.getByLabelText('E-posta')).toHaveValue('user@example.com');
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Şifreyi Değiştir' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Görev atandığında' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Yorum geldiğinde' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Mesaj geldiğinde' })).toBeChecked();
  });

  it('copies display ID', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Görünen ID kopyala/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDE'));
  });

  it('requires the exact profile email and shows the localized last-admin error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue({
      response: { data: { error: 'LAST_COMPANY_ADMIN_REQUIRED' } },
    });
    deleteMock.mockReturnValue({ mutateAsync, isPending: false });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Hesabı sil' }));
    const confirm = screen.getByRole('button', { name: 'Hesabı kalıcı olarak sil' });
    const emailInput = screen.getByLabelText('Onaylamak için hesap e-posta adresinizi girin');
    expect(confirm).toBeDisabled();

    fireEvent.change(emailInput, { target: { value: 'different@example.com' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(emailInput, { target: { value: profile.email } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText(/Şirketin son yöneticisi hesabını silemez/i)).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledWith(profile.email);
  });

  it('uses the existing logout path after successful account deletion', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ mutateAsync, isPending: false });
    logoutSpy = vi.spyOn(authApi, 'post').mockResolvedValue({ data: null } as never);
    useTeamStore.getState().setActiveTeamId('team-1');
    queryClient.setQueryData(['delete-private-data'], { value: 'cached' });
    renderProtectedPage();

    fireEvent.click(screen.getByRole('button', { name: 'Hesabı sil' }));
    fireEvent.change(screen.getByLabelText('Onaylamak için hesap e-posta adresinizi girin'), {
      target: { value: profile.email },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hesabı kalıcı olarak sil' }));

    await waitFor(() => expect(screen.getByTestId('public-landing')).toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledWith(profile.email);
    expect(logoutSpy).toHaveBeenCalledWith('/logout');
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    expect(useTeamStore.getState().activeTeamId).toBeNull();
    expect(queryClient.getQueryData(['delete-private-data'])).toBeUndefined();
  });

  it('guards avatar files over 25 MB on client', () => {
    const { container } = renderPage();
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 + 1 });

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(screen.getByText('Avatar dosyası 25 MB veya daha küçük olmalı.')).toBeInTheDocument();
  });

  it('redirects to login after credential mutation revokes session', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ sessionRevoked: true });
    updateMock.mockReturnValue({ mutateAsync, isPending: false, isError: false, error: null });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi Değiştir' }));
    fireEvent.change(screen.getByLabelText('Eski şifre'), { target: { value: 'hunter22' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre'), { target: { value: 'new-hunter22' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre onayı'), { target: { value: 'new-hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi güncelle' }));

    await waitFor(() => expect(screen.getByTestId('public-login')).toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledWith({
      currentPassword: 'hunter22',
      newPassword: 'new-hunter22',
    });
  });

  it('cleans up locally after a failed logout without flashing the protected-route sign-in page', async () => {
    logoutSpy = vi.spyOn(authApi, 'post').mockRejectedValue(new Error('session already expired'));
    useTeamStore.getState().setActiveTeamId('team-1');
    queryClient.setQueryData(['logout-private-data'], { value: 'cached' });
    const { container } = renderProtectedPage();
    const observer = observeSignInRequired(container);

    fireEvent.click(screen.getByRole('button', { name: 'Çıkış Yap' }));

    await waitFor(() => expect(screen.getByTestId('public-landing')).toBeInTheDocument());
    await waitFor(() => expect(logoutSpy).toHaveBeenCalledWith('/logout'));
    await waitFor(() => expect(observer.signInRequiredInsertions).toEqual([]));
    observer.disconnect();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    expect(useTeamStore.getState().activeTeamId).toBeNull();
    expect(localStorage.getItem('taskflow-active-team')).toBeNull();
    expect(queryClient.getQueryData(['logout-private-data'])).toBeUndefined();
  });

  it.each(['resolves', 'rejects'] as const)(
    'finishes logout after Profile unmounts while the request %s',
    async (outcome) => {
      let resolveLogout!: (response: { data: null }) => void;
      let rejectLogout!: (error: Error) => void;
      const logoutRequest = new Promise<{ data: null }>((resolve, reject) => {
        resolveLogout = resolve;
        rejectLogout = reject;
      });
      logoutSpy = vi.spyOn(authApi, 'post').mockReturnValue(logoutRequest as never);
      useTeamStore.getState().setActiveTeamId('team-1');
      queryClient.setQueryData(['logout-private-data'], { value: 'cached' });
      const { container } = renderProtectedPage();
      const observer = observeSignInRequired(container);

      fireEvent.click(screen.getByRole('button', { name: 'Çıkış Yap' }));
      await waitFor(() => expect(logoutSpy).toHaveBeenCalledWith('/logout'));
      fireEvent.click(screen.getByRole('button', { name: 'Navigate away from profile' }));
      await waitFor(() => expect(screen.getByText('Other protected page')).toBeInTheDocument());

      if (outcome === 'resolves') resolveLogout({ data: null });
      else rejectLogout(new Error('session already expired'));

      await waitFor(() => expect(screen.getByTestId('profile-location')).toHaveTextContent(/^\/$/));
      expect(screen.getByTestId('public-landing')).toBeInTheDocument();
      await waitFor(() => expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null }));
      await waitFor(() => expect(useTeamStore.getState().activeTeamId).toBeNull());
      await waitFor(() => expect(queryClient.getQueryData(['logout-private-data'])).toBeUndefined());
      await waitFor(() => expect(observer.signInRequiredInsertions).toEqual([]));
      observer.disconnect();
    },
  );
});
