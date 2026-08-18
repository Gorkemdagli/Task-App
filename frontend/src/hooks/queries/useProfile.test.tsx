import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as profileService from '@/services/profile';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useProfile, useUpdateProfile, useUploadAvatar } from './useProfile';

const profile: profileService.CurrentUserProfile = {
  id: 'user-1',
  displayId: 'ABCDE',
  email: 'user@example.com',
  fullName: 'User',
  role: 'member',
  tenantId: null,
  tenantName: null,
  avatarUrl: 'https://cdn.test/avatar.webp',
  notifyTaskAssigned: true,
  notifyTaskCommented: true,
  notifyMessageReceived: true,
};

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useProfile', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'user-1',
        displayId: 'ABCDE',
        email: 'user@example.com',
        fullName: 'User',
        role: 'member',
        tenantId: null,
      },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('fetches tenantless-safe profile by user identity', async () => {
    const get = vi.spyOn(profileService, 'getProfile').mockResolvedValue(profile);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useProfile(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.profile('user-1'))).toEqual(profile);
  });

  it('replaces profile cache and auth snapshot after update', async () => {
    vi.spyOn(profileService, 'updateProfile').mockResolvedValue(profile);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

    result.current.mutate({ fullName: 'Updated' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.profile('user-1'))).toEqual(profile);
    expect(useAuthStore.getState().user).toMatchObject({
      id: 'user-1',
      fullName: 'User',
      avatarUrl: profile.avatarUrl,
    });
  });

  it('clears auth and all queries after credential revocation', async () => {
    vi.spyOn(profileService, 'updateProfile').mockResolvedValue({ sessionRevoked: true });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    queryClient.setQueryData(['stale'], { value: true });
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

    result.current.mutate({ email: 'new@example.com', currentPassword: 'hunter22' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryData(['stale'])).toBeUndefined();
  });

  it('replaces profile cache after avatar upload', async () => {
    vi.spyOn(profileService, 'uploadAvatar').mockResolvedValue(profile);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const { result } = renderHook(() => useUploadAvatar(), { wrapper: wrapper(queryClient) });

    result.current.mutate(new File(['avatar'], 'avatar.png', { type: 'image/png' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.profile('user-1'))).toEqual(profile);
    expect(useAuthStore.getState().user?.avatarUrl).toBe(profile.avatarUrl);
  });
});
