import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import * as teamsService from '../../services/teams';

/**
 * Query keys:
 *  - ['teams'] — kullanıcının erişebildiği takım listesi
 *  - ['team', id] — tek takım detayı (üyeler + taskCount)
 */
export const teamKeys = {
  all: ['teams'] as const,
  detail: (id: string) => ['team', id] as const,
};

export function useTeams(): UseQueryResult<teamsService.Team[]> {
  return useQuery({
    queryKey: teamKeys.all,
    queryFn: teamsService.listTeams,
  });
}

export function useTeam(id: string | undefined): UseQueryResult<teamsService.TeamDetail> {
  return useQuery({
    queryKey: id ? teamKeys.detail(id) : ['team', '__none__'],
    queryFn: () => teamsService.getTeam(id!),
    enabled: Boolean(id),
  });
}
