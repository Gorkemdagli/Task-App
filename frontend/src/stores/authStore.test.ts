import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => useAuthStore.getState().clearAuth());

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
      avatarUrl: 'https://cdn.test/avatar.webp',
    });
    expect(useAuthStore.getState().user?.avatarUrl).toBe('https://cdn.test/avatar.webp');
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

  it('establishSession advances generation for every successful session, including the same user', () => {
    const user = {
      id: '1',
      displayId: 'A3X9K',
      email: 'a@example.com',
      fullName: 'A',
      role: 'companyAdmin' as const,
      tenantId: 't1',
    };
    const before = useAuthStore.getState().sessionGeneration;

    useAuthStore.getState().establishSession('first-token', user);
    const firstSessionGeneration = useAuthStore.getState().sessionGeneration;
    useAuthStore.getState().establishSession('second-token', user);

    expect(firstSessionGeneration).toBe(before + 1);
    expect(useAuthStore.getState().sessionGeneration).toBe(firstSessionGeneration + 1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'second-token', user });
  });

  it('advances session generation at auth boundaries but preserves token and profile refreshes', () => {
    const user = {
      id: '1',
      displayId: 'A3X9K',
      email: 'a@x.com',
      fullName: 'A',
      role: 'companyAdmin' as const,
      tenantId: 't1',
    };
    useAuthStore.getState().setAccessToken('first-token');
    useAuthStore.getState().setUser(user);
    const loggedInGeneration = useAuthStore.getState().sessionGeneration;

    useAuthStore.getState().setAccessToken('refreshed-token');
    useAuthStore.getState().setUser({ ...user, fullName: 'Updated profile' });
    expect(useAuthStore.getState().sessionGeneration).toBe(loggedInGeneration);

    useAuthStore.getState().setUser({ ...user, id: '2' });
    expect(useAuthStore.getState().sessionGeneration).toBeGreaterThan(loggedInGeneration);
    const changedUserGeneration = useAuthStore.getState().sessionGeneration;
    useAuthStore.getState().setUser({ ...user, id: '2', tenantId: 't2' });
    expect(useAuthStore.getState().sessionGeneration).toBeGreaterThan(changedUserGeneration);

    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAccessToken('new-login-token');
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().sessionGeneration).toBeGreaterThan(changedUserGeneration);
  });
});
