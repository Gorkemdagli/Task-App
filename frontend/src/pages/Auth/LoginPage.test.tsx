import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders } from 'axios';
import { LoginPage } from './LoginPage';
import i18n from '../../i18n';
import { api, authApi } from '../../lib/api';
import { queryClient } from '../../lib/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { useProfile } from '../../hooks/queries/useProfile';
import type { CurrentUserProfile } from '../../services/profile';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../lib/api', () => ({ authApi: { post: vi.fn() }, api: { get: vi.fn() } }));

const loginProfile: CurrentUserProfile = {
  id: 'login-user',
  displayId: 'AB234',
  email: 'a@x.com',
  fullName: 'A User',
  role: 'member',
  tenantId: 'tenant-1',
  tenantName: 'Acme Corp',
  avatarUrl: null,
  tenantLogoUrl: 'https://cdn.taskflow.test/logo.png',
  notifyTaskAssigned: false,
  notifyTaskCommented: true,
  notifyMessageReceived: false,
};

function ProfileQueryProbe() {
  const { data } = useProfile();
  return <span data-testid="profile-query">{data ? 'ready' : 'loading'}</span>;
}

describe('LoginPage', () => {
  beforeEach(() => {
    queryClient.clear();
    useAuthStore.getState().clearAuth();
    vi.resetAllMocks();
  });

  it('renders fields', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/e-posta/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
  });

  it('switches login copy between English and Turkish', async () => {
    const previousLanguage = i18n.language;
    try {
      await i18n.changeLanguage('en');
      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>,
      );
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await i18n.changeLanguage('tr');
      expect(screen.getByLabelText('E-posta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Giriş Yap' })).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
  it('field errors on empty submit', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await u.click(screen.getByRole('button', { name: /giriş yap/i }));
    expect(await screen.findByText(/geçerli bir e-posta/i)).toBeInTheDocument();
    expect(await screen.findByText(/şifre gerekli/i)).toBeInTheDocument();
  });
  it('form-top on 401', async () => {
    vi.mocked(authApi.post).mockRejectedValueOnce({
      response: { status: 401, data: { message: 'E-posta veya şifre hatalı' } },
    });
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText('Şifre'), 'wrong');
    await u.click(screen.getByRole('button', { name: /giriş yap/i }));
    expect(await screen.findByText(/e-posta veya şifre hatalı/i)).toBeInTheDocument();
  });
  it('seeds the complete login profile so profile observers skip the GET', async () => {
    queryClient.setQueryData(queryKeys.profile('previous-user'), loginProfile);
    vi.mocked(authApi.post).mockResolvedValueOnce({
      data: { accessToken: 'access-token', user: loginProfile },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    const u = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
          <ProfileQueryProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await u.type(screen.getByLabelText(/e-posta/i), 'a@x.com');
    await u.type(screen.getByLabelText(/ifre$/i), 'hunter22');
    const generationBeforeLogin = useAuthStore.getState().sessionGeneration;
    await u.click(screen.getByRole('button', { name: /Giriş Yap/i }));

    expect(await screen.findByTestId('profile-query')).toHaveTextContent('ready');
    expect(queryClient.getQueryData(queryKeys.profile(loginProfile.id))).toEqual(loginProfile);
    expect(queryClient.getQueryData(queryKeys.profile('previous-user'))).toBeUndefined();
    expect(api.get).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.id).toBe(loginProfile.id);
    expect(useAuthStore.getState().sessionGeneration).toBe(generationBeforeLogin + 1);
  });

  it('password visibility toggle is keyboard accessible', async () => {
    const u = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const password = screen.getByLabelText('Şifre');
    expect(password).toHaveAttribute('type', 'password');
    await u.click(screen.getByRole('button', { name: 'Şifreyi göster' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Şifreyi gizle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('link to /register', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/hesap oluştur/i).closest('a')).toHaveAttribute('href', '/register');
  });
});
