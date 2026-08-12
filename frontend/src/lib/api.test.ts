import { describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { api, createApi, getMe } from './api';
import { useAuthStore } from '../stores/authStore';

const mock = new MockAdapter(axios);
const apiMock = new MockAdapter(api);

describe('api interceptors', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
    mock.reset();
    apiMock.reset();
  });

  it('attaches Authorization from store', async () => {
    useAuthStore.getState().setAccessToken('t1');
    mock.onGet('/test').reply((c) => {
      expect(c.headers?.Authorization).toBe('Bearer t1');
      return [200, {}];
    });
    await createApi({ baseURL: '/' }).get('/test');
  });

  it('refreshes on 401 + retries', async () => {
    useAuthStore.getState().setAccessToken('old');
    mock.onGet('/protected').replyOnce(401);
    mock.onGet('/protected').reply((c) => {
      expect(c.headers?.Authorization).toBe('Bearer new');
      return [200, { ok: true }];
    });
    mock.onPost('/api/v1/auth/refresh').reply(() => [200, { accessToken: 'new' }]);
    const r = await createApi({ baseURL: '/' }).get('/protected');
    expect(r.data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('does not refresh on /auth/login 401', async () => {
    mock.onPost('/auth/login').reply(401, { error: 'U' });
    await expect(createApi({ baseURL: '/' }).post('/auth/login')).rejects.toBeDefined();
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
    const client = createApi({ baseURL: '/' });
    useAuthStore.getState().setAccessToken('old');
    mock.onGet('/a').replyOnce(401).onGet('/a').reply(200, { ok: 'a' });
    mock.onGet('/b').replyOnce(401).onGet('/b').reply(200, { ok: 'b' });
    mock.onPost('/api/v1/auth/refresh').reply(200, { accessToken: 'new' });

    await Promise.all([client.get('/a'), client.get('/b')]);

    expect(mock.history.post.filter((entry) => entry.url === '/api/v1/auth/refresh')).toHaveLength(
      1,
    );
  });
});
