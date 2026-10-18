import { describe, it, expect, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api, authApi, getMe } from './api';
import { queryClient } from './react-query';
import { clearGlobalError, getGlobalError } from './globalError';
import { useAuthStore } from '../stores/authStore';
import { CancelledError } from '@tanstack/react-query';

const apiMock = new MockAdapter(api);
let authApiMock: MockAdapter;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('api interceptors', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
    clearGlobalError();
    queryClient.clear();
    apiMock.reset();
    if (authApi) {
      authApiMock ??= new MockAdapter(authApi);
      authApiMock.reset();
    }
  });

  it('uses same-origin auth client without bearer and direct API client with bearer', async () => {
    useAuthStore.getState().setAccessToken('t1');

    expect(authApi).toBeDefined();
    if (!authApi) return;

    expect(authApi.defaults.baseURL).toBe('/api/v1/auth');
    expect(authApi.defaults.withCredentials).toBe(true);
    expect(api.defaults.baseURL).toMatch(/\/api\/v1$/);
    expect(api.defaults.withCredentials).toBe(false);

    authApiMock.onPost('/login').reply((config) => {
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, { accessToken: 'auth-token' }];
    });
    apiMock.onGet('/users/me').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer t1');
      return [200, {}];
    });

    await authApi.post('/login', { email: 'a@x.com', password: 'password' });
    await api.get('/users/me');
  });

  it('attaches the current access token to logout', async () => {
    useAuthStore.getState().setAccessToken('t1');
    authApiMock.onPost('/logout').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer t1');
      return [204];
    });

    await authApi.post('/logout');
  });

  it('attaches Authorization from store', async () => {
    useAuthStore.getState().setAccessToken('t1');
    apiMock.onGet('/test').reply((c) => {
      expect(c.headers?.Authorization).toBe('Bearer t1');
      return [200, {}];
    });
    await api.get('/test');
  });

  it('refreshes on 401 + retries', async () => {
    useAuthStore.getState().setAccessToken('old');
    apiMock.onGet('/protected').replyOnce(401);
    apiMock.onGet('/protected').reply((c) => {
      expect(c.headers?.Authorization).toBe('Bearer new');
      return [200, { ok: true }];
    });
    authApiMock.onPost('/refresh').reply(() => [200, { accessToken: 'new' }]);
    const r = await api.get('/protected');
    expect(r.data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('does not refresh on /auth/login 401', async () => {
    authApiMock.onPost('/login').reply(401, { error: 'U' });
    await expect(authApi.post('/login')).rejects.toBeDefined();
  });

  it('gets the canonical user from /users/me', async () => {
    const canonicalUser = {
      id: 'u1',
      displayId: 'ABCDE',
      email: 'u@example.com',
      fullName: 'Canonical',
      role: 'member' as const,
      tenantId: null,
      tenantName: null,
    };
    useAuthStore.getState().setAccessToken('token');
    apiMock.onGet('/users/me').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer token');
      return [200, canonicalUser];
    });

    await expect(getMe()).resolves.toEqual(canonicalUser);
  });

  it('shares one refresh request across concurrent 401 responses', async () => {
    useAuthStore.getState().setAccessToken('old');
    apiMock.onGet('/a').replyOnce(401).onGet('/a').reply(200, { ok: 'a' });
    apiMock.onGet('/b').replyOnce(401).onGet('/b').reply(200, { ok: 'b' });
    authApiMock.onPost('/refresh').reply(200, { accessToken: 'new' });

    await Promise.all([api.get('/a'), api.get('/b')]);

    expect(authApiMock.history.post.filter((entry) => entry.url === '/refresh')).toHaveLength(1);
  });

  it('ends the session and reports an expired session after refresh returns 401', async () => {
    useAuthStore.getState().setAccessToken('old');
    apiMock.onGet('/protected').reply(401);
    authApiMock.onPost('/refresh').reply(401, { message: 'sensitive backend detail' });

    await expect(
      queryClient.fetchQuery({
        queryKey: ['global-error', 'expired'],
        queryFn: () => api.get('/protected'),
        retry: false,
      }),
    ).rejects.toBeDefined();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    expect(getGlobalError()).toBe('session-expired');
  });

  it('keeps auth on refresh transport failure and reports a network error', async () => {
    useAuthStore.getState().setAccessToken('still-usable');
    apiMock.onGet('/protected').reply(401);
    authApiMock.onPost('/refresh').networkError();

    await expect(
      queryClient.fetchQuery({
        queryKey: ['global-error', 'network'],
        queryFn: () => api.get('/protected'),
        retry: false,
      }),
    ).rejects.toBeDefined();

    expect(useAuthStore.getState().accessToken).toBe('still-usable');
    expect(getGlobalError()).toBe('network');
  });

  it('does not restore auth or retry a request when its refresh completes after logout', async () => {
    useAuthStore.getState().setAccessToken('old');
    const refresh = deferred<[number, { accessToken: string }] >();
    const refreshStarted = deferred<void>();
    let protectedCalls = 0;
    apiMock.onGet('/protected').reply(() => {
      protectedCalls += 1;
      return [401];
    });
    authApiMock.onPost('/refresh').reply(() => {
      refreshStarted.resolve();
      return refresh.promise;
    });

    const request = queryClient.fetchQuery({
      queryKey: ['protected', 'logout-race'],
      queryFn: () => api.get('/protected'),
    });
    const settledRequest = request.catch((error: unknown) => error);
    await refreshStarted.promise;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
    refresh.resolve([200, { accessToken: 'late-token' }]);

    await expect(settledRequest).resolves.toBeInstanceOf(CancelledError);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(protectedCalls).toBe(1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    expect(getGlobalError()).toBeNull();
  });

  it('keeps a newly established session when an old refresh completes after login clears queries', async () => {
    const oldUser = {
      id: 'old-user',
      displayId: 'OLD1',
      email: 'old@example.com',
      fullName: 'Old User',
      role: 'member' as const,
      tenantId: 'old-tenant',
    };
    const newUser = {
      id: 'new-user',
      displayId: 'NEW1',
      email: 'new@example.com',
      fullName: 'New User',
      role: 'member' as const,
      tenantId: 'new-tenant',
    };
    useAuthStore.getState().establishSession('old-token', oldUser);
    const refresh = deferred<[number, { accessToken: string }] >();
    const refreshStarted = deferred<void>();
    let protectedCalls = 0;
    apiMock.onGet('/protected').reply(() => {
      protectedCalls += 1;
      return [401];
    });
    authApiMock.onPost('/refresh').reply(() => {
      refreshStarted.resolve();
      return refresh.promise;
    });

    const request = queryClient.fetchQuery({
      queryKey: ['protected', 'login-race'],
      queryFn: () => api.get('/protected'),
    });
    const settledRequest = request.catch((error: unknown) => error);
    await refreshStarted.promise;

    useAuthStore.getState().establishSession('new-token', newUser);
    queryClient.clear();
    queryClient.setQueryData(['new-user-data'], { secret: 'new-user-cache' });
    refresh.resolve([200, { accessToken: 'late-old-token' }]);

    await expect(settledRequest).resolves.toBeInstanceOf(CancelledError);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(protectedCalls).toBe(1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'new-token', user: newUser });
    expect(queryClient.getQueryData(['new-user-data'])).toEqual({ secret: 'new-user-cache' });
    expect(getGlobalError()).toBeNull();
  });

  it('keeps refresh flights isolated across sessions without clobbering the new flight', async () => {
    useAuthStore.getState().setAccessToken('old');
    const oldRefresh = deferred<[number, { accessToken: string }] >();
    const newRefresh = deferred<[number, { accessToken: string }] >();
    const refreshStarted = [deferred<void>(), deferred<void>()];
    let refreshCalls = 0;
    let oldProtectedCalls = 0;
    apiMock.onGet('/old-protected').reply(() => {
      oldProtectedCalls += 1;
      return [401];
    });
    apiMock.onGet('/new-a').replyOnce(401).onGet('/new-a').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer refreshed-new');
      return [200, { ok: 'a' }];
    });
    apiMock.onGet('/new-b').replyOnce(401).onGet('/new-b').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer refreshed-new');
      return [200, { ok: 'b' }];
    });
    authApiMock.onPost('/refresh').reply(() => {
      const currentCall = refreshCalls++;
      refreshStarted[currentCall]?.resolve();
      return currentCall === 0 ? oldRefresh.promise : newRefresh.promise;
    });

    const oldRequest = queryClient.fetchQuery({
      queryKey: ['protected', 'old-session'],
      queryFn: () => api.get('/old-protected'),
      retry: false,
    });
    await refreshStarted[0].promise;

    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAccessToken('new-login-token');
    useAuthStore.getState().setUser({
      id: 'new-user',
      displayId: 'NEW1',
      email: 'new@example.com',
      fullName: 'New User',
      role: 'member',
      tenantId: 'new-tenant',
    });
    queryClient.setQueryData(['new-user-data'], { secret: 'new-user-cache' });

    const requestA = api.get('/new-a');
    await refreshStarted[1].promise;
    oldRefresh.resolve([200, { accessToken: 'late-old-token' }]);
    await expect(oldRequest).rejects.toBeInstanceOf(CancelledError);

    const requestB = api.get('/new-b');
    await Promise.resolve();
    expect(refreshCalls).toBe(2);
    expect(useAuthStore.getState().accessToken).toBe('new-login-token');
    expect(queryClient.getQueryData(['new-user-data'])).toEqual({ secret: 'new-user-cache' });
    expect(getGlobalError()).toBeNull();

    newRefresh.resolve([200, { accessToken: 'refreshed-new' }]);
    await expect(Promise.all([requestA, requestB])).resolves.toHaveLength(2);
    expect(refreshCalls).toBe(2);
    expect(oldProtectedCalls).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe('refreshed-new');
  });

  it('ignores a stale refresh rejection after a new session starts', async () => {
    useAuthStore.getState().setAccessToken('old');
    const refresh = deferred<[number, { accessToken: string }] >();
    const refreshStarted = deferred<void>();
    let protectedCalls = 0;
    apiMock.onGet('/protected').reply(() => {
      protectedCalls += 1;
      return [401];
    });
    authApiMock.onPost('/refresh').reply(() => {
      refreshStarted.resolve();
      return refresh.promise;
    });

    const request = queryClient.fetchQuery({
      queryKey: ['protected', 'stale-rejection'],
      queryFn: () => api.get('/protected'),
      retry: false,
    });
    await refreshStarted.promise;

    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAccessToken('new-login-token');
    useAuthStore.getState().setUser({
      id: 'new-user',
      displayId: 'NEW1',
      email: 'new@example.com',
      fullName: 'New User',
      role: 'member',
      tenantId: 'new-tenant',
    });
    queryClient.setQueryData(['new-user-data'], { secret: 'new-user-cache' });
    refresh.reject({ response: { status: 401 }, isAxiosError: true });

    await expect(request).rejects.toBeInstanceOf(CancelledError);
    expect(protectedCalls).toBe(1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'new-login-token', user: { id: 'new-user' } });
    expect(queryClient.getQueryData(['new-user-data'])).toEqual({ secret: 'new-user-cache' });
    expect(getGlobalError()).toBeNull();
  });

  it('clears auth and user cache when refresh returns 204', async () => {
    useAuthStore.getState().setAccessToken('old');
    useAuthStore.getState().setUser({
      id: 'old-user',
      displayId: 'OLD1',
      email: 'old@example.com',
      fullName: 'Old User',
      role: 'member',
      tenantId: 'old-tenant',
    });
    queryClient.setQueryData(['old-user-data'], { secret: 'old-user-cache' });
    apiMock.onGet('/protected').reply(401);
    authApiMock.onPost('/refresh').reply(204);

    await expect(
      queryClient.fetchQuery({
        queryKey: ['protected', 'empty-refresh'],
        queryFn: () => api.get('/protected'),
        retry: false,
      }),
    ).rejects.toBeDefined();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
    expect(queryClient.getQueryData(['old-user-data'])).toBeUndefined();
    expect(apiMock.history.get.filter((request) => request.url === '/protected')).toHaveLength(1);
    expect(getGlobalError()).toBe('sign-in-required');
  });

  it('keeps auth after a page-blocking 403 query and reports access denied', async () => {
    useAuthStore.getState().setAccessToken('still-authorized');
    apiMock.onGet('/forbidden').reply(403, { message: 'sensitive backend detail' });

    await expect(
      queryClient.fetchQuery({
        queryKey: ['global-error', 'forbidden'],
        queryFn: () => api.get('/forbidden'),
        retry: false,
      }),
    ).rejects.toBeDefined();

    expect(useAuthStore.getState().accessToken).toBe('still-authorized');
    expect(getGlobalError()).toBe('access-denied');
  });
});
