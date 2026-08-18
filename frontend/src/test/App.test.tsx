import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { getMe } from '../lib/api';
import { queryClient } from '../lib/react-query';
import { useAuthStore } from '../stores/authStore';
import { RouteFallback } from '../components/layout/RouteFallback';

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

describe('AuthBootstrap canonical flow', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/login');
    useAuthStore.setState({ accessToken: null, user: null });
    vi.mocked(getMe).mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores /users/me as canonical after refresh', async () => {
    const refreshUser = { ...canonicalUser, fullName: 'Stale' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'fresh', user: refreshUser }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
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

  it('clears auth when refresh fails', async () => {
    useAuthStore.setState({ accessToken: 'stale', user: canonicalUser });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(<App />);

    await waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    });
    expect(getMe).not.toHaveBeenCalled();
  });

  it('clears auth and query cache when canonical user fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'fresh' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.mocked(getMe).mockRejectedValue(new Error('me failed'));
    const clearSpy = vi.spyOn(queryClient, 'clear');

    render(<App />);

    await waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    });
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/login');
    useAuthStore.setState({ accessToken: null, user: null });
    vi.mocked(getMe).mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('shows loading initially', async () => {
    render(<App />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/yükleniyor/i)).not.toBeInTheDocument();
    });
  });
  it('redirects unauth /dashboard to /login', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText(/giriş yap/i).length).toBeGreaterThan(0);
    });
  });

  it('renders the shared route fallback', () => {
    render(<RouteFallback />);

    expect(screen.getByTestId('route-fallback')).toBeInTheDocument();
  });
});
