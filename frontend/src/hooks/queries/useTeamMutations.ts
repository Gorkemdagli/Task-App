import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as teamsService from '../../services/teams';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

/**
 * POST /teams. Başarıda listeyi invalidate et.
 */
export function useCreateTeam() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: (input: teamsService.CreateTeamInput) => teamsService.createTeam(input),
    onSuccess: () => {
      if (tenantId) qc.invalidateQueries({ queryKey: queryKeys.teams.list(tenantId) });
    },
  });
}

/**
 * POST /teams/:id/members. Başarıda takım detayını invalidate et.
 */
export function useAddMember(teamId: string) {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: (input: teamsService.AddMemberInput) => teamsService.addMember(teamId, input),
    onSuccess: () => {
      if (tenantId) qc.invalidateQueries({ queryKey: queryKeys.team.detail(tenantId, teamId) });
    },
  });
}

/**
 * DELETE /teams/:id/members/:userId. Başarıda takım detayını invalidate et.
 */
export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: (userId: string) => teamsService.removeMember(teamId, userId),
    onSuccess: () => {
      if (tenantId) qc.invalidateQueries({ queryKey: queryKeys.team.detail(tenantId, teamId) });
    },
  });
}

export function useUpdateMemberRole(teamId: string) {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: teamsService.TeamMemberRole }) =>
      teamsService.updateMemberRole(teamId, userId, role),
    onSuccess: () => {
      if (tenantId) qc.invalidateQueries({ queryKey: queryKeys.team.detail(tenantId, teamId) });
    },
  });
}
