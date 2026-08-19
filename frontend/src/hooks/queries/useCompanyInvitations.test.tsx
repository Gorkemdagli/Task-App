import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as companyInvitationsService from '@/services/companyInvitations';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import {
  useAcceptCompanyInvitation,
  useCancelCompanyInvitation,
  useCompanyInvitationAdmin,
  useCompanyInvitations,
  useCreateCompanyInvitation,
  useRejectCompanyInvitation,
} from './useCompanyInvitations';

const tenantlessUser = {
  id: 'user-1',
  displayId: 'USER1',
  email: 'user@example.com',
  fullName: 'User',
  role: 'member' as const,
  tenantId: null,
};

const adminUser = { ...tenantlessUser, role: 'companyAdmin' as const, tenantId: 'tenant-a' };

const invitation = {
  id: 'invitation-1',
  tenantId: 'tenant-a',
  companyName: 'Acme',
  inviterName: 'Admin',
  status: 'pending' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
  respondedAt: null,
  recipientUserId: 'user-2',
  recipientDisplayId: 'USER2',
  recipientEmail: 'user2@example.com',
  recipientFullName: 'User Two',
};

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('company invitation query hooks', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'token', user: tenantlessUser });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads incoming invitations for tenantless authenticated users', async () => {
    const list = vi
      .spyOn(companyInvitationsService, 'listMyCompanyInvitations')
      .mockResolvedValue([invitation]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useCompanyInvitations(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(queryKeys.companyInvitations.incoming())).toEqual([invitation]);
  });

  it('uses tenant-scoped admin query key', async () => {
    vi.spyOn(companyInvitationsService, 'listCompanyInvitations').mockResolvedValue([invitation]);
    useAuthStore.setState({ user: adminUser });
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useCompanyInvitationAdmin(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.companyInvitations.admin('tenant-a'))).toEqual([
      invitation,
    ]);
  });

  it('syncs accepted user and invalidates invitation and tenant caches', async () => {
    const acceptedUser = { ...adminUser, id: 'user-1', tenantName: 'Acme' };
    vi.spyOn(companyInvitationsService, 'acceptCompanyInvitation').mockResolvedValue({
      invitation: { ...invitation, status: 'accepted' },
      user: acceptedUser,
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAcceptCompanyInvitation(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync('invitation-1');
    });

    expect(useAuthStore.getState().user).toEqual(acceptedUser);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.companyInvitations.incoming(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.companyUsers('tenant-a'),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.teams.list('tenant-a') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.notifications('tenant-a') });
  });

  it('invalidates correct invitation scopes after create, cancel, and reject', async () => {
    vi.spyOn(companyInvitationsService, 'createCompanyInvitation').mockResolvedValue({
      ...invitation,
      recipientUserId: 'user-2',
      recipientDisplayId: 'USER2',
      recipientEmail: 'user2@example.com',
      recipientFullName: 'User Two',
    });
    vi.spyOn(companyInvitationsService, 'cancelCompanyInvitation').mockResolvedValue(invitation);
    vi.spyOn(companyInvitationsService, 'rejectCompanyInvitation').mockResolvedValue({
      ...invitation,
      status: 'rejected',
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    useAuthStore.setState({ user: adminUser });
    const create = renderHook(() => useCreateCompanyInvitation(), { wrapper: wrapper(client) });
    await act(async () => {
      await create.result.current.mutateAsync('USER2');
    });
    const cancel = renderHook(() => useCancelCompanyInvitation(), { wrapper: wrapper(client) });
    await act(async () => {
      await cancel.result.current.mutateAsync('invitation-1');
    });

    act(() => {
      useAuthStore.setState({ user: tenantlessUser });
    });
    const reject = renderHook(() => useRejectCompanyInvitation(), { wrapper: wrapper(client) });
    await act(async () => {
      await reject.result.current.mutateAsync('invitation-1');
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.companyInvitations.admin('tenant-a'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.companyInvitations.incoming(),
    });
  });
});
