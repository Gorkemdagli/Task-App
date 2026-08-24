import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '@/lib/queryKeys';
import { getCompanyDashboard, type CompanyDashboard } from '@/services/companyDashboard';

export function useCompanyDashboard(teamId: string | null): UseQueryResult<CompanyDashboard> {
  const user = useAuthStore((state) => state.user);
  const tenantId = user?.tenantId ?? null;

  return useQuery({
    queryKey: queryKeys.companyDashboard(tenantId ?? 'tenantless', teamId),
    queryFn: () => getCompanyDashboard(teamId ?? undefined),
    enabled: user?.role === 'companyAdmin' && Boolean(tenantId),
    refetchOnWindowFocus: true,
  });
}
