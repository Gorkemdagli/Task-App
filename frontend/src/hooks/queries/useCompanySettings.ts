import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companySettingsService from '@/services/companySettings';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

function syncCompanySettings(
  settings: companySettingsService.CompanySettings,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.setQueryData(queryKeys.companySettings(settings.id), settings);
  const user = useAuthStore.getState().user;
  if (user && user.tenantId === settings.id) {
    useAuthStore.getState().setUser({ ...user, tenantName: settings.name });
  }
}

export function useCompanySettings() {
  const user = useAuthStore((state) => state.user);
  const tenantId = user?.tenantId ?? null;
  return useQuery({
    queryKey: queryKeys.companySettings(tenantId ?? 'tenantless'),
    queryFn: companySettingsService.getCompanySettings,
    enabled: user?.role === 'companyAdmin' && Boolean(tenantId),
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: companySettingsService.updateCompanySettings,
    onSuccess: (settings) => syncCompanySettings(settings, queryClient),
  });
}

export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: companySettingsService.uploadCompanyLogo,
    onSuccess: (settings) => syncCompanySettings(settings, queryClient),
  });
}
