import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import * as teamsService from '../../services/teams';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

/**
 * Query keys:
 *  - ['teams'] — kullanıcının erişebildiği takım listesi
 *  - ['team', id] — tek takım detayı (üyeler + taskCount)
 */
export function useTeams(): UseQueryResult<teamsService.Team[]> {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery({
    queryKey: queryKeys.teams.list(tenantId ?? 'tenantless'),
    queryFn: teamsService.listTeams,
    enabled: Boolean(tenantId),
  });
}

export function useTeam(id: string | undefined): UseQueryResult<teamsService.TeamDetail> {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery({
    queryKey: queryKeys.team.detail(tenantId ?? 'tenantless', id ?? 'none'),
    queryFn: () => teamsService.getTeam(id!),
    enabled: Boolean(tenantId && id),
  });
}

export function useTeamMemberCandidates(
  teamId: string,
  query: string,
  enabled = true,
): UseQueryResult<teamsService.TeamMemberCandidate[]> {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const normalizedQuery = query.trim();
  return useQuery({
    queryKey: queryKeys.team.memberCandidates(tenantId ?? 'tenantless', teamId, normalizedQuery),
    queryFn: () => teamsService.searchTeamMemberCandidates(teamId, normalizedQuery),
    enabled: enabled && Boolean(tenantId && teamId) && normalizedQuery.length >= 2,
    staleTime: 10_000,
  });
}
