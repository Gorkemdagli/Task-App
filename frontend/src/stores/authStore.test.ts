import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => useAuthStore.setState({ accessToken: null, user: null }));

  it('starts null', () => {
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('setAccessToken', () => {
    useAuthStore.getState().setAccessToken('t');
    expect(useAuthStore.getState().accessToken).toBe('t');
  });

  it('setUser', () => {
    useAuthStore.getState().setUser({
      id: '1',
      displayId: 'A3X9K',
      email: 'a@x.com',
      fullName: 'A',
      role: 'companyAdmin',
      tenantId: 't1',
    });
    expect(useAuthStore.getState().user?.email).toBe('a@x.com');
  });

  it('clearAuth resets both', () => {
    useAuthStore.getState().setAccessToken('t');
    useAuthStore.getState().setUser({
      id: '1',
      displayId: 'A3X9K',
      email: 'a@x.com',
      fullName: 'A',
      role: 'companyAdmin',
      tenantId: 't1',
    });
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
