import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companyUsersService from '../../services/companyUsers';

export const companyUserKeys = {
  all: ['company-users'] as const,
};

export function useCompanyUsers(enabled = true) {
  return useQuery({
    queryKey: companyUserKeys.all,
    queryFn: companyUsersService.listCompanyUsers,
    enabled,
  });
}

export function useUpdateCompanyRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: companyUsersService.CompanyUser['role'];
    }) => companyUsersService.updateCompanyRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyUserKeys.all });
    },
  });
}

export function useUpdateCompanyPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: companyUsersService.updateCompanyPermissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyUserKeys.all });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
