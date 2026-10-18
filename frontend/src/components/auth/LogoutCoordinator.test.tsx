import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { authApi } from '@/lib/api';
import { queryClient } from '@/lib/react-query';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { LogoutCoordinatorProvider, useLogout } from './LogoutCoordinator';

const sessionUser: AuthUser = {
  id: 'logout-user',
  displayId: 'AB123',
  email: 'logout@example.com',
  fullName: 'Logout User',
  role: 'member',
  tenantId: 'tenant-1',
};
const privateQueryKey = ['logout-coordinator-private-data'];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function LogoutTrigger({ onStart }: { onStart: (promise: Promise<void>) => void }) {
  const logout = useLogout();
  return (
    <button type="button" onClick={() => onStart(logout())}>
      Logout
    </button>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="logout-location">{location.pathname}</output>;
}

function renderLogoutFlow({
  onStart,
  strict = false,
}: {
  onStart: (promise: Promise<void>) => void;
  strict?: boolean;
}) {
  const flow = (
    <MemoryRouter initialEntries={['/protected']}>
      <LogoutCoordinatorProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<p>Protected page</p>} />
            <Route path="/protected-other" element={<p>Other protected page</p>} />
          </Route>
          <Route path="/login" element={<p>Login route</p>} />
        </Routes>
        <LogoutTrigger onStart={onStart} />
        <LocationProbe />
      </LogoutCoordinatorProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{flow}</StrictMode> : flow);
}

function seedSession() {
  useAuthStore.getState().establishSession('old-access-token', sessionUser);
  useTeamStore.getState().setActiveTeamId('team-old');
  queryClient.setQueryData(privateQueryKey, { owner: sessionUser.id });
}

function observeSignInRequired(container: HTMLElement) {
  const insertions: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const text = node.textContent ?? '';
        if (text.includes('Bu sayfaya erişmek için giriş yapın')) insertions.push(text);
      }
    }
  });
  observer.observe(container, { childList: true, subtree: true });
  return { insertions, disconnect: () => observer.disconnect() };
}

describe('LogoutCoordinatorProvider', () => {
  let postSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useTeamStore.getState().clearActiveTeam();
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    postSpy = undefined;
  });

  it.each(['resolves', 'rejects'] as const)(
    'clears local session after the public route commits when server logout %s',
    async (outcome) => {
      seedSession();
      const request = createDeferred<{ data: null }>();
      postSpy = vi.spyOn(authApi, 'post').mockReturnValue(request.promise as never);
      const actualClear = queryClient.clear.bind(queryClient);
      const pathsAtClear: string[] = [];
      const clearSpy = vi.spyOn(queryClient, 'clear').mockImplementation(() => {
        pathsAtClear.push(screen.getByTestId('logout-location').textContent ?? '');
        actualClear();
      });
      let logoutPromise!: Promise<void>;
      const { container } = renderLogoutFlow({ onStart: (promise) => (logoutPromise = promise), strict: true });
      const observer = observeSignInRequired(container);

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/logout'));

      expect(useAuthStore.getState().accessToken).toBe('old-access-token');
      expect(useTeamStore.getState().activeTeamId).toBe('team-old');
      expect(queryClient.getQueryData(privateQueryKey)).toEqual({ owner: sessionUser.id });
      expect(clearSpy).not.toHaveBeenCalled();

      if (outcome === 'resolves') request.resolve({ data: null });
      else request.reject(new Error('session already expired'));

      await waitFor(() => expect(screen.getByText('Login route')).toBeInTheDocument());
      await expect(logoutPromise).resolves.toBeUndefined();
      await act(async () => {
        await Promise.resolve();
      });
      observer.disconnect();

      expect(pathsAtClear).toEqual(['/login']);
      expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
      expect(useTeamStore.getState().activeTeamId).toBeNull();
      expect(queryClient.getQueryData(privateQueryKey)).toBeUndefined();
      expect(observer.insertions).toEqual([]);
      expect(postSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('deduplicates concurrent calls for the same session generation', async () => {
    seedSession();
    const request = createDeferred<{ data: null }>();
    postSpy = vi.spyOn(authApi, 'post').mockReturnValue(request.promise as never);
    const promises: Promise<void>[] = [];
    renderLogoutFlow({ onStart: (promise) => promises.push(promise) });

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(promises).toHaveLength(2);
    expect(promises[0]).toBe(promises[1]);

    request.resolve({ data: null });
    await expect(promises[0]).resolves.toBeUndefined();
    expect(await screen.findByText('Login route')).toBeInTheDocument();
  });

  it.each(['same-user', 'different-user'] as const)(
    'cancels late logout when a %s session is established',
    async (replacement) => {
      seedSession();
      const request = createDeferred<{ data: null }>();
      postSpy = vi.spyOn(authApi, 'post').mockReturnValue(request.promise as never);
      const pathsAtClear: string[] = [];
      const actualClear = queryClient.clear.bind(queryClient);
      vi.spyOn(queryClient, 'clear').mockImplementation(() => {
        pathsAtClear.push(screen.getByTestId('logout-location').textContent ?? '');
        actualClear();
      });
      let logoutPromise!: Promise<void>;
      const { container } = renderLogoutFlow({ onStart: (promise) => (logoutPromise = promise) });
      const observer = observeSignInRequired(container);

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
      const replacementUser =
        replacement === 'same-user' ? sessionUser : { ...sessionUser, id: 'new-user' };
      act(() => {
        useAuthStore.getState().establishSession('new-access-token', replacementUser);
        useTeamStore.getState().setActiveTeamId('team-new');
        queryClient.setQueryData(privateQueryKey, { owner: replacementUser.id });
      });

      await expect(logoutPromise).resolves.toBeUndefined();
      request.resolve({ data: null });
      await act(async () => {
        await Promise.resolve();
      });
      observer.disconnect();

      expect(screen.getByTestId('logout-location')).toHaveTextContent('/protected');
      expect(screen.getByText('Protected page')).toBeInTheDocument();
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'new-access-token',
        user: replacementUser,
      });
      expect(useTeamStore.getState().activeTeamId).toBe('team-new');
      expect(queryClient.getQueryData(privateQueryKey)).toEqual({ owner: replacementUser.id });
      expect(pathsAtClear).toEqual([]);
      expect(observer.insertions).toEqual([]);
    },
  );

  it('does not request logout or clear an established session during initial StrictMode mounts', () => {
    seedSession();
    postSpy = vi.spyOn(authApi, 'post');
    renderLogoutFlow({ onStart: vi.fn(), strict: true });

    expect(postSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBe('old-access-token');
    expect(useTeamStore.getState().activeTeamId).toBe('team-old');
    expect(queryClient.getQueryData(privateQueryKey)).toEqual({ owner: sessionUser.id });
  });
});
