import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as companyDashboardService from '@/services/companyDashboard';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useCompanyDashboard } from './useCompanyDashboard';

const dashboard = {} as companyDashboardService.CompanyDashboard;

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setUser(role: 'companyAdmin' | 'member', tenantId: string | null) {
  useAuthStore.setState({
    accessToken: 'token',
    user: {
      id: 'user-a',
      displayId: 'USERA',
      email: 'user@example.com',
      fullName: 'User A',
      role,
      tenantId,
      tenantName: tenantId ? 'Acme' : null,
    },
  });
}

describe('useCompanyDashboard', () => {
  beforeEach(() => {
    vi.spyOn(companyDashboardService, 'getCompanyDashboard').mockResolvedValue(dashboard);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays disabled without tenant', () => {
    setUser('companyAdmin', null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useCompanyDashboard(null), {
      wrapper: wrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(companyDashboardService.getCompanyDashboard).not.toHaveBeenCalled();
  });

  it('stays disabled for member', () => {
    setUser('member', 'tenant-a');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useCompanyDashboard(null), {
      wrapper: wrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(companyDashboardService.getCompanyDashboard).not.toHaveBeenCalled();
  });

  it('fetches company dashboard with focus refetch and no polling', async () => {
    setUser('companyAdmin', 'tenant-a');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useCompanyDashboard('team-a'), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(companyDashboardService.getCompanyDashboard).toHaveBeenCalledWith('team-a');

    const query = queryClient.getQueryCache().find({
      queryKey: queryKeys.companyDashboard('tenant-a', 'team-a'),
    });
    const options = query?.options as { refetchOnWindowFocus?: boolean; refetchInterval?: unknown };
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchInterval).toBeUndefined();
  });
});
