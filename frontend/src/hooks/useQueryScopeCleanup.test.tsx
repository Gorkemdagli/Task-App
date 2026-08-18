import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { useQueryScopeCleanup } from './useQueryScopeCleanup';

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useQueryScopeCleanup', () => {
  it('removes previous tenant scope while preserving new tenant data', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.teams.list('tenant-a'), ['old']);
    client.setQueryData(queryKeys.teams.list('tenant-b'), ['new']);
    useAuthStore.setState({
      user: {
        id: 'user-1',
        displayId: 'AAAAA',
        email: 'user@example.com',
        fullName: 'User',
        role: 'member',
        tenantId: 'tenant-a',
      },
    });
    renderHook(() => useQueryScopeCleanup(), { wrapper: wrapper(client) });

    act(() => {
      useAuthStore.setState({ user: { ...useAuthStore.getState().user!, tenantId: 'tenant-b' } });
    });

    expect(client.getQueryData(queryKeys.teams.list('tenant-a'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.teams.list('tenant-b'))).toEqual(['new']);
  });

  it('removes only previous team scope within same tenant', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.team.detail('tenant-a', 'team-1'), ['old']);
    client.setQueryData(queryKeys.team.detail('tenant-a', 'team-2'), ['keep']);
    client.setQueryData(queryKeys.teams.list('tenant-a'), ['keep']);
    useAuthStore.setState({
      user: {
        id: 'user-1',
        displayId: 'AAAAA',
        email: 'user@example.com',
        fullName: 'User',
        role: 'member',
        tenantId: 'tenant-a',
      },
    });
    useTeamStore.setState({ activeTeamId: 'team-1' });
    renderHook(() => useQueryScopeCleanup(), { wrapper: wrapper(client) });

    act(() => {
      useTeamStore.setState({ activeTeamId: 'team-2' });
    });

    expect(client.getQueryData(queryKeys.team.detail('tenant-a', 'team-1'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.team.detail('tenant-a', 'team-2'))).toEqual(['keep']);
    expect(client.getQueryData(queryKeys.teams.list('tenant-a'))).toEqual(['keep']);
  });
});
