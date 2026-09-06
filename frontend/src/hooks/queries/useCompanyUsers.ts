import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companyUsersService from '../../services/companyUsers';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

export function useCompanyUsers(enabled = true) {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery({
    queryKey: queryKeys.companyUsers(tenantId ?? 'tenantless'),
    queryFn: companyUsersService.listCompanyUsers,
    enabled: enabled && Boolean(tenantId),
  });
}

export function useUpdateCompanyPermissions() {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: companyUsersService.updateCompanyPermissions,
    onSuccess: () => {
      if (!tenantId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.companyUsers(tenantId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(tenantId) });
    },
  });
}
