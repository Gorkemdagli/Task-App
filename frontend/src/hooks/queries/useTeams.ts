import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as teamsService from '../../services/teams';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useRouteDataReadiness } from '@/components/layout/RouteDataReadiness';

/**
 * Query keys:
 *  - ['teams'] — kullanıcının erişebildiği takım listesi
 *  - ['team', id] — tek takım detayı (üyeler + taskCount)
 */
export function useTeams(enabled?: boolean): UseQueryResult<teamsService.Team[]> {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const readiness = useRouteDataReadiness();
  const query = useQuery({
    queryKey: queryKeys.teams.list(tenantId ?? 'tenantless'),
    queryFn: teamsService.listTeams,
    enabled: Boolean(tenantId) && (enabled ?? readiness.teamsEnabled),
  });
  useEffect(() => {
    if (readiness.phase === 'teams' && query.data !== undefined) {
      readiness.completePhase('teams', readiness.teamTasksRequired && !query.data?.length);
    }
  }, [query.data, readiness]);
  return !query.data && !(enabled ?? readiness.teamsEnabled)
    ? { ...query, isLoading: true } as UseQueryResult<teamsService.Team[]>
    : query;
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
