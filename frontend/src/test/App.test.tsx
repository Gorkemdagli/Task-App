import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import { api, authApi, getMe } from '../lib/api';
import { queryClient } from '../lib/react-query';
import { useAuthStore } from '../stores/authStore';
import { RouteFallback } from '../components/layout/RouteFallback';
import { clearGlobalError, getGlobalError } from '../lib/globalError';
import { queryKeys } from '../lib/queryKeys';
import type { CurrentUserProfile } from '../services/profile';

vi.mock('../lib/api', async () => {
  const actual = (await vi.importActual('../lib/api')) as Record<string, unknown>;
  return { ...actual, getMe: vi.fn() };
});

const canonicalUser: CurrentUserProfile = {
  id: 'u1',
  displayId: 'ABCDE',
  email: 'u@example.com',
  fullName: 'Canonical',
  role: 'member' as const,
  tenantId: null,
  tenantName: null,
  tenantLogoUrl: null,
  avatarUrl: null,
  notifyTaskAssigned: true,
  notifyTaskCommented: true,
  notifyMessageReceived: true,
};

let refreshSpy: MockInstance;

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('AuthBootstrap canonical flow', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/login');
    useAuthStore.setState({ accessToken: null, user: null });
    clearGlobalError();
    queryClient.clear();
    vi.mocked(getMe).mockReset();
    stubMatchMedia();
    refreshSpy = vi.spyOn(authApi, 'post').mockResolvedValue({ status: 204, data: null } as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearGlobalError();
  });

  it('stores /users/me as canonical after refresh', async () => {
    const refreshUser = { ...canonicalUser, fullName: 'Stale' };
    refreshSpy.mockResolvedValue({
      status: 200,
      data: { accessToken: 'fresh', user: refreshUser },
    } as never);
    vi.mocked(getMe).mockResolvedValue(canonicalUser);

    render(<App />);

    await waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'fresh',
        user: canonicalUser,
      });
    });
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('keeps protected bootstrap pending state non-textual and accessible', () => {
    window.history.pushState({}, '', '/dashboard');
    refreshSpy.mockReturnValue(new Promise(() => {}) as never);

    render(<App />);

    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('Sayfa yükleniyor');
    expect(screen.getByTestId('route-fallback').querySelector('.sr-only')).toBeInTheDocument();
  });

  it('seeds the complete profile query so the sidebar reuses bootstrap /users/me', async () => {
    window.history.pushState({}, '', '/dashboard');
    const previousUser = { ...canonicalUser, id: 'previous-user' };
    useAuthStore.setState({ accessToken: 'stale', user: previousUser });
    queryClient.setQueryData(queryKeys.profile(previousUser.id), previousUser);
    refreshSpy.mockResolvedValue({ status: 200, data: { accessToken: 'fresh' } } as never);
    vi.mocked(getMe).mockResolvedValue(canonicalUser);
    const apiGet = vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}) as never);

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls.filter(([url]) => url === '/users/me')).toHaveLength(0);
    expect(queryClient.getQueryData(queryKeys.profile(canonicalUser.id))).toEqual(canonicalUser);
  });

  it('keeps auth empty when refresh returns 204', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();

    await waitFor(() => expect(screen.queryByText(/yÃ¼kleniyor/i)).not.toBeInTheDocument());
    expect(getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    expect(queryClient.getQueryData(queryKeys.profile(canonicalUser.id))).toBeUndefined();
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('preserves auth and reports a network error when refresh cannot reach the server', async () => {
    useAuthStore.setState({ accessToken: 'stale', user: canonicalUser });
    refreshSpy.mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK' });

    render(<App />);

    await waitFor(() => expect(getGlobalError()).toBe('network'));
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'stale', user: canonicalUser });
    expect(getMe).not.toHaveBeenCalled();
  });

  it('retries session bootstrap after a network failure and reaches the protected view', async () => {
    window.history.pushState({}, '', '/dashboard');
    refreshSpy
      .mockRejectedValueOnce({ isAxiosError: true, code: 'ERR_NETWORK' })
      .mockResolvedValueOnce({ status: 200, data: { accessToken: 'fresh' } } as never);
    vi.mocked(getMe).mockResolvedValue(canonicalUser);
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}) as never);

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Bağlantı kurulamadı' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));

    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(refreshSpy).toHaveBeenCalledTimes(2);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh', user: canonicalUser });
  }, 15_000);

  it('keeps auth and cache when canonical user fetch fails without confirmed auth failure', async () => {
    refreshSpy.mockResolvedValue({ status: 200, data: { accessToken: 'fresh' } } as never);
    vi.mocked(getMe).mockRejectedValue(new Error('me failed'));
    const clearSpy = vi.spyOn(queryClient, 'clear');

    render(<App />);

    await waitFor(() => expect(getGlobalError()).toBe('generic'));
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh', user: null });
    expect(clearSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.profile(canonicalUser.id))).toBeUndefined();
  });

  it('ends a stale session and offers login when bootstrap confirms 401', async () => {
    useAuthStore.setState({ accessToken: 'stale', user: canonicalUser });
    refreshSpy.mockRejectedValue({ response: { status: 401 } });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Oturumunuz sona erdi' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
  });
});

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/login');
    useAuthStore.setState({ accessToken: null, user: null });
    clearGlobalError();
    queryClient.clear();
    vi.mocked(getMe).mockReset();
    stubMatchMedia();
    refreshSpy = vi.spyOn(authApi, 'post').mockResolvedValue({ status: 204, data: null } as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearGlobalError();
  });
  it('shows loading initially', async () => {
    render(<App />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/yükleniyor/i)).not.toBeInTheDocument();
    });
  });
  it('shows sign-in required on a protected route and keeps login accessible', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Bu sayfaya erişmek için giriş yapın' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Giriş yap' }));
    expect(await screen.findByRole('heading', { name: 'Giriş Yap' })).toBeInTheDocument();
  });

  it('renders the homepage during restore and waits for canonical confirmation before changing CTAs', async () => {
    window.history.pushState({}, '', '/');
    let resolveRefresh!: (value: unknown) => void;
    let resolveMe!: (value: CurrentUserProfile) => void;
    refreshSpy.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve as (value: unknown) => void; }) as never,
    );
    vi.mocked(getMe).mockImplementation(
      () => new Promise((resolve) => { resolveMe = resolve; }),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(getMe).not.toHaveBeenCalled();
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Panoya git' })).not.toBeInTheDocument();

    await act(async () => {
      resolveRefresh({ status: 200, data: { accessToken: 'fresh' } });
    });
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link', { name: 'Panoya git' })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();

    await act(async () => {
      resolveMe(canonicalUser);
    });
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Panoya git' }).length).toBeGreaterThan(0);
    });

    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('a[href="/login"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).not.toBeInTheDocument();
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('keeps the homepage guest-facing after restore fails with stale auth state', async () => {
    window.history.pushState({}, '', '/');
    useAuthStore.setState({ accessToken: 'stale', user: canonicalUser });
    refreshSpy.mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK' });

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    await waitFor(() => expect(getGlobalError()).toBe('network'));

    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Panoya git' })).not.toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'stale', user: canonicalUser });
  });

  it('waits for canonical restore when navigation reaches a protected route', async () => {
    window.history.pushState({}, '', '/');
    let resolveRefresh!: (value: unknown) => void;
    let resolveMe!: (value: CurrentUserProfile) => void;
    refreshSpy.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve as (value: unknown) => void; }) as never,
    );
    vi.mocked(getMe).mockImplementation(
      () => new Promise((resolve) => { resolveMe = resolve; }),
    );
    const apiGet = vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}) as never);

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    act(() => {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();

    await act(async () => {
      resolveRefresh({ status: 200, data: { accessToken: 'fresh' } });
    });
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();

    await act(async () => {
      resolveMe(canonicalUser);
    });
    expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalled();
  }, 15_000);

  it('keeps confirmed sessions on the landing route when auth state changes', async () => {
    window.history.pushState({}, '', '/');
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    const ctaLinks = await screen.findAllByRole(
      'link',
      { name: 'Ücretsiz başla' },
      { timeout: 10_000 },
    );
    expect(ctaLinks.length).toBeGreaterThan(0);

    act(() => {
      useAuthStore.setState({ accessToken: 'fresh', user: canonicalUser });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Panoya git' }).length).toBeGreaterThan(0);
    });
    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('a[href="/login"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).not.toBeInTheDocument();
  });

  it('renders the shared route fallback', () => {
    render(<RouteFallback />);

    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
  });

  it('renders a not-found screen for unknown routes', async () => {
    window.history.pushState({}, '', '/unknown-path');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Aradığınız sayfa bulunamadı' }),
    ).toBeInTheDocument();
  });
});
