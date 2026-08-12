import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as teamsService from '../../services/teams';
import { teamKeys } from './useTeams';

/**
 * POST /teams. Başarıda listeyi invalidate et.
 */
export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: teamsService.CreateTeamInput) => teamsService.createTeam(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/**
 * POST /teams/:id/members. Başarıda takım detayını invalidate et.
 */
export function useAddMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: teamsService.AddMemberInput) => teamsService.addMember(teamId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

/**
 * DELETE /teams/:id/members/:userId. Başarıda takım detayını invalidate et.
 */
export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => teamsService.removeMember(teamId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

export function useUpdateMemberRole(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: teamsService.TeamMemberRole }) =>
      teamsService.updateMemberRole(teamId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}
