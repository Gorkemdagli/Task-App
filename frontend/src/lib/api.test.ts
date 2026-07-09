import { describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { createApi } from './api';
import { useAuthStore } from '../stores/authStore';

const mock = new MockAdapter(axios);

describe('api interceptors', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
    mock.reset();
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
    mock.onPost('/auth/refresh').reply(() => [200, { accessToken: 'new' }]);
    const r = await createApi({ baseURL: '/' }).get('/protected');
    expect(r.data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('does not refresh on /auth/login 401', async () => {
    mock.onPost('/auth/login').reply(401, { error: 'U' });
    await expect(createApi({ baseURL: '/' }).post('/auth/login')).rejects.toBeDefined();
  });
});
