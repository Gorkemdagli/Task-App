import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '@/lib/queryKeys';
import {
  getTeamDashboard,
  type CompanyDashboardRange,
  type TeamDashboard,
} from '@/services/companyDashboard';

export function useTeamDashboard(
  teamId: string | undefined,
  range: CompanyDashboardRange = '30d',
  enabled = true,
): UseQueryResult<TeamDashboard> {
  const user = useAuthStore((state) => state.user);
  const tenantId = user?.tenantId ?? null;

  return useQuery({
    queryKey: queryKeys.team.dashboard(tenantId ?? 'tenantless', teamId ?? 'none', range),
    queryFn: () => getTeamDashboard(teamId!, range),
    enabled: enabled && Boolean(tenantId && teamId),
    refetchOnWindowFocus: true,
  });
}
