import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dashboardService from '@/services/companyDashboard';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useTeamDashboard } from './useTeamDashboard';

const dashboard = {} as dashboardService.TeamDashboard;

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setUser(tenantId: string | null) {
  useAuthStore.setState({
    accessToken: 'token',
    user: {
      id: 'user-a',
      displayId: 'USERA',
      email: 'user@example.com',
      fullName: 'User A',
      role: 'member',
      tenantId,
      tenantName: tenantId ? 'Acme' : null,
    },
  });
}

describe('useTeamDashboard', () => {
  beforeEach(() => {
    vi.spyOn(dashboardService, 'getTeamDashboard').mockResolvedValue(dashboard);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays disabled when the team tab is hidden', () => {
    setUser('tenant-a');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useTeamDashboard('team-a', '30d', false), {
      wrapper: wrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(dashboardService.getTeamDashboard).not.toHaveBeenCalled();
  });

  it('fetches the team-scoped dashboard and keeps tenant cache isolation', async () => {
    setUser('tenant-a');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useTeamDashboard('team-a', '7d'), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(dashboardService.getTeamDashboard).toHaveBeenCalledWith('team-a', '7d');
    expect(
      queryClient.getQueryCache().find({
        queryKey: queryKeys.team.dashboard('tenant-a', 'team-a', '7d'),
      }),
    ).toBeDefined();
  });
});
