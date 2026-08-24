import { describe, it, expect, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api, authApi, getMe } from './api';
import { useAuthStore } from '../stores/authStore';

const apiMock = new MockAdapter(api);
let authApiMock: MockAdapter;

describe('api interceptors', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
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
});
