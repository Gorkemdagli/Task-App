import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as companySettingsService from '@/services/companySettings';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import {
  useCompanySettings,
  useUpdateCompanySettings,
  useUploadCompanyLogo,
} from './useCompanySettings';

const settings: companySettingsService.CompanySettings = {
  id: 'tenant-a',
  name: 'Acme Corp',
  slug: 'acme-corp',
  description: null,
  logoUrl: null,
};

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCompanySettings', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'admin',
        displayId: 'ADMIN',
        email: 'admin@example.com',
        fullName: 'Admin',
        role: 'companyAdmin',
        tenantId: 'tenant-a',
        tenantName: 'Old Name',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches only for company admin with tenant and scopes cache', async () => {
    const get = vi.spyOn(companySettingsService, 'getCompanySettings').mockResolvedValue(settings);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useCompanySettings(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.companySettings('tenant-a'))).toEqual(settings);
  });

  it('replaces settings cache and auth tenant name after update', async () => {
    vi.spyOn(companySettingsService, 'updateCompanySettings').mockResolvedValue({
      ...settings,
      name: 'Updated Company',
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const { result } = renderHook(() => useUpdateCompanySettings(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ name: 'Updated Company' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.companySettings('tenant-a'))).toMatchObject({
      name: 'Updated Company',
    });
    expect(useAuthStore.getState().user?.tenantName).toBe('Updated Company');
  });

  it('replaces settings cache after logo upload', async () => {
    vi.spyOn(companySettingsService, 'uploadCompanyLogo').mockResolvedValue({
      ...settings,
      logoUrl: 'https://cdn.test/logo.webp',
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const { result } = renderHook(() => useUploadCompanyLogo(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate(new File(['logo'], 'logo.png', { type: 'image/png' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.companySettings('tenant-a'))).toMatchObject({
      logoUrl: 'https://cdn.test/logo.webp',
    });
  });
});
