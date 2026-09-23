import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import { api, authApi, getMe } from '../lib/api';
import { queryClient } from '../lib/react-query';
import { useAuthStore } from '../stores/authStore';
import { RouteFallback } from '../components/layout/RouteFallback';
import { clearGlobalError, getGlobalError } from '../lib/globalError';

vi.mock('../lib/api', async () => {
  const actual = (await vi.importActual('../lib/api')) as Record<string, unknown>;
  return { ...actual, getMe: vi.fn() };
});

const canonicalUser = {
  id: 'u1',
  displayId: 'ABCDE',
  email: 'u@example.com',
  fullName: 'Canonical',
  role: 'member' as const,
  tenantId: null,
  tenantName: null,
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

  it('keeps auth empty when refresh returns 204', async () => {
    render(<App />);

    await waitFor(() => expect(screen.queryByText(/yÃ¼kleniyor/i)).not.toBeInTheDocument());
    expect(getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
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
  });

  it('keeps auth and cache when canonical user fetch fails without confirmed auth failure', async () => {
    refreshSpy.mockResolvedValue({ status: 200, data: { accessToken: 'fresh' } } as never);
    vi.mocked(getMe).mockRejectedValue(new Error('me failed'));
    const clearSpy = vi.spyOn(queryClient, 'clear');

    render(<App />);

    await waitFor(() => expect(getGlobalError()).toBe('generic'));
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh', user: null });
    expect(clearSpy).not.toHaveBeenCalled();
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

  it('re-evaluates the root route when auth state changes', async () => {
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

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
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
