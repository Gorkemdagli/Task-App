import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companyUsersService from '../../services/companyUsers';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type { CompanyUser } from '@/services/companyUsers';

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
    onSuccess: (updatedUser) => {
      if (!tenantId) return;
      const companyUsersKey = queryKeys.companyUsers(tenantId);
      queryClient.setQueryData<CompanyUser[]>(companyUsersKey, (current) =>
        current?.map((candidate) => (candidate.id === updatedUser.id ? updatedUser : candidate)),
      );
      queryClient.invalidateQueries({ queryKey: companyUsersKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(tenantId) });
    },
  });
}
