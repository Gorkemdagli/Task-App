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
import { preloadDashboardRoute } from '../lib/preloadDashboardRoute';
import type { CurrentUserProfile } from '../services/profile';

vi.mock('../lib/api', async () => {
  const actual = (await vi.importActual('../lib/api')) as Record<string, unknown>;
  return { ...actual, getMe: vi.fn() };
});
vi.mock('../lib/preloadDashboardRoute', () => ({
  preloadDashboardRoute: vi.fn().mockResolvedValue(undefined),
}));

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
    vi.mocked(preloadDashboardRoute).mockClear();
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

  it('shows a data-free dashboard scaffold while protected bootstrap is pending', () => {
    window.history.pushState({}, '', '/dashboard');
    refreshSpy.mockReturnValue(new Promise(() => {}) as never);

    render(<App />);

    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('Sayfa yükleniyor');
    expect(screen.getByTestId('route-fallback').querySelector('.sr-only')).toBeInTheDocument();
    const scaffold = screen.getByTestId('dashboard-route-skeleton');
    expect(scaffold.querySelectorAll('a, button')).toHaveLength(0);
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
  });

  it.each(['/tasks', '/dashboard/other'])(
    'keeps the generic fallback outside the exact dashboard route (%s)',
    (path) => {
      window.history.pushState({}, '', path);
      refreshSpy.mockReturnValue(new Promise(() => {}) as never);

      render(<App />);

      expect(screen.getByTestId('route-fallback').querySelector('.animate-spin')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-route-skeleton')).not.toBeInTheDocument();
    },
  );

  it('preloads dashboard code during auth restore but waits for canonical user before mounting it', async () => {
    window.history.pushState({}, '', '/dashboard');
    let resolveRefresh!: (value: unknown) => void;
    let resolveMe!: (user: CurrentUserProfile) => void;
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

    await waitFor(() => expect(preloadDashboardRoute).toHaveBeenCalledTimes(1));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();

    await act(async () => {
      resolveRefresh({ status: 200, data: { accessToken: 'fresh' } });
    });
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();

    await act(async () => {
      resolveMe(canonicalUser);
    });
    expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh', user: canonicalUser });
  }, 15_000);

  it('does not preload dashboard code for the landing route', () => {
    window.history.pushState({}, '', '/');
    refreshSpy.mockReturnValue(new Promise(() => {}) as never);

    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(preloadDashboardRoute).not.toHaveBeenCalled();
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
  it('renders a usable login form while refresh is pending and after no session is found', async () => {
    await import('../pages/Auth/AuthLayout');
    await import('../pages/Auth/LoginPage');
    let resolveRefresh!: (value: unknown) => void;
    refreshSpy.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve as (value: unknown) => void; }) as never,
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Giri/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Giri/ })).toBeEnabled();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRefresh({ status: 204, data: null });
    });

    expect(screen.getByRole('heading', { name: /Giri/ })).toBeVisible();
    expect(getGlobalError()).toBeNull();
  });

  it('keeps login usable after a transient tokenless refresh failure', async () => {
    refreshSpy.mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK' });

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Giri/ })).toBeVisible();
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
    expect(getGlobalError()).toBeNull();
    expect(screen.getByRole('button', { name: /Giri/ })).toBeEnabled();
  });

  it.each(['session invalidation', 'unmount'] as const)(
    'ignores a late refresh response after %s',
    async (ending) => {
      let resolveRefresh!: (value: unknown) => void;
      refreshSpy.mockImplementation(
        () => new Promise((resolve) => { resolveRefresh = resolve as (value: unknown) => void; }) as never,
      );

      const app = render(<App />);
      expect(await screen.findByRole('heading', { name: /Giri/ })).toBeVisible();
      await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));

      if (ending === 'session invalidation') {
        act(() => useAuthStore.getState().clearAuth());
      } else {
        app.unmount();
      }

      await act(async () => {
        resolveRefresh({ status: 200, data: { accessToken: 'late-refresh' } });
      });

      expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
      expect(getMe).not.toHaveBeenCalled();
    },
  );

  it('redirects to the dashboard after a canonical session refresh on login', async () => {
    refreshSpy.mockResolvedValue({ status: 200, data: { accessToken: 'fresh' } } as never);
    vi.mocked(getMe).mockResolvedValue(canonicalUser);
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}) as never);

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh', user: canonicalUser });
  }, 15_000);

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

    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByText(/yÃ¼kleniyor/i)).not.toBeInTheDocument();
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

  it('allows sign-in and reaches the protected app after an unauthenticated refresh timeout', async () => {
    window.history.pushState({}, '', '/');
    refreshSpy
      .mockRejectedValueOnce({ response: { status: 504 } })
      .mockResolvedValueOnce({
        status: 200,
        data: { accessToken: 'signed-in', user: canonicalUser },
      } as never);
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}) as never);

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(getGlobalError()).toBeNull();
    fireEvent.click(document.querySelector('a[href="/login"]')!);
    expect(await screen.findByRole('heading', { name: /Giri/ })).toBeInTheDocument();
    expect(getGlobalError()).toBeNull();

    fireEvent.change(document.querySelector('#email')!, { target: { value: 'u@example.com' } });
    fireEvent.change(document.querySelector('#password')!, { target: { value: 'FixturePass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Giri/ }));

    expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(refreshSpy).toHaveBeenNthCalledWith(2, '/login', {
      email: 'u@example.com',
      password: 'FixturePass123!',
    });
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'signed-in', user: canonicalUser });
    expect(getGlobalError()).toBeNull();
  });

  it.each(['204', '200', 'network error'] as const)(
    'ignores a late %s refresh after a successful login',
    async (lateResult) => {
      let resolveRefresh!: (value: unknown) => void;
      let rejectRefresh!: (error: unknown) => void;
      refreshSpy.mockImplementation((url: string) => {
        if (url === '/refresh') {
          return new Promise((resolve, reject) => {
            resolveRefresh = resolve as (value: unknown) => void;
            rejectRefresh = reject;
          }) as never;
        }
        return Promise.resolve({
          status: 200,
          data: { accessToken: 'signed-in', user: canonicalUser },
        }) as never;
      });
      vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}) as never);

      render(
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>,
      );

      expect(await screen.findByRole('heading', { name: /Giri/ })).toBeVisible();
      fireEvent.change(document.querySelector('#email')!, { target: { value: 'u@example.com' } });
      fireEvent.change(document.querySelector('#password')!, { target: { value: 'FixturePass123!' } });
      fireEvent.click(screen.getByRole('button', { name: /Giri/ }));

      expect(await screen.findByTestId('app-shell', {}, { timeout: 10_000 })).toBeInTheDocument();
      const loginGeneration = useAuthStore.getState().sessionGeneration;

      await act(async () => {
        if (lateResult === '204') resolveRefresh({ status: 204, data: null });
        else if (lateResult === '200') {
          resolveRefresh({ status: 200, data: { accessToken: 'late-refresh' } });
        } else {
          rejectRefresh({ isAxiosError: true, code: 'ERR_NETWORK' });
        }
      });

      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'signed-in',
        user: canonicalUser,
        sessionGeneration: loginGeneration,
      });
      expect(queryClient.getQueryData(queryKeys.profile(canonicalUser.id))).toEqual(canonicalUser);
      expect(getGlobalError()).toBeNull();
      if (lateResult === '200') expect(getMe).not.toHaveBeenCalled();
    },
  );

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

  it('keeps the default shared route fallback generic', () => {
    render(<RouteFallback />);

    expect(screen.getByTestId('route-fallback').querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders a not-found screen for unknown routes', async () => {
    window.history.pushState({}, '', '/unknown-path');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Aradığınız sayfa bulunamadı' }),
    ).toBeInTheDocument();
  });
});
