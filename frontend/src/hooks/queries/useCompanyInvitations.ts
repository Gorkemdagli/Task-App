import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companyInvitationsService from '@/services/companyInvitations';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

export function useCompanyInvitations() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return useQuery({
    queryKey: queryKeys.companyInvitations.incoming(),
    queryFn: companyInvitationsService.listMyCompanyInvitations,
    enabled: Boolean(accessToken),
  });
}

export function useCompanyInvitationAdmin() {
  const user = useAuthStore((state) => state.user);
  const tenantId = user?.tenantId ?? null;
  return useQuery({
    queryKey: queryKeys.companyInvitations.admin(tenantId ?? 'tenantless'),
    queryFn: companyInvitationsService.listCompanyInvitations,
    enabled: user?.role === 'companyAdmin' && Boolean(tenantId),
  });
}

export function useCreateCompanyInvitation() {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: companyInvitationsService.createCompanyInvitation,
    onSuccess: () => {
      if (tenantId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.companyInvitations.admin(tenantId) });
      }
    },
  });
}

export function useCancelCompanyInvitation() {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: companyInvitationsService.cancelCompanyInvitation,
    onSuccess: () => {
      if (tenantId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.companyInvitations.admin(tenantId) });
      }
    },
  });
}

export function useAcceptCompanyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: companyInvitationsService.acceptCompanyInvitation,
    onSuccess: ({ user }) => {
      useAuthStore.getState().setUser(user);
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInvitations.incoming() });
      if (!user.tenantId) return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyInvitations.admin(user.tenantId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyUsers(user.tenantId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(user.tenantId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user.tenantId) });
    },
  });
}

export function useRejectCompanyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: companyInvitationsService.rejectCompanyInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInvitations.incoming() });
    },
  });
}
