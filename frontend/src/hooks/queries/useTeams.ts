import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as teamsService from '../../services/teams';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useRouteDataReadiness } from '@/components/layout/RouteDataReadiness';

export function teamsQueryOptions(tenantId: string) {
  return {
    queryKey: queryKeys.teams.list(tenantId),
    queryFn: teamsService.listTeams,
  };
}

export function teamDetailQueryOptions(tenantId: string, teamId: string) {
  return {
    queryKey: queryKeys.team.detail(tenantId, teamId),
    queryFn: () => teamsService.getTeam(teamId),
  };
}

/**
 * Query keys:
 *  - ['teams'] — kullanıcının erişebildiği takım listesi
 *  - ['team', id] — tek takım detayı (üyeler + taskCount)
 */
export function useTeams(enabled?: boolean): UseQueryResult<teamsService.Team[]> {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const readiness = useRouteDataReadiness();
  const query = useQuery({
    ...teamsQueryOptions(tenantId ?? 'tenantless'),
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
    ...teamDetailQueryOptions(tenantId ?? 'tenantless', id ?? 'none'),
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
