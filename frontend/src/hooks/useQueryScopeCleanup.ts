import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';

export function useQueryScopeCleanup(): void {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const teamId = useTeamStore((state) => state.activeTeamId);
  const previous = useRef({ tenantId, teamId });

  useEffect(() => {
    const old = previous.current;
    if (old.tenantId && old.tenantId !== tenantId) {
      queryClient.removeQueries({ queryKey: queryKeys.tenant(old.tenantId) });
    } else if (tenantId && old.teamId && old.teamId !== teamId) {
      queryClient.removeQueries({ queryKey: queryKeys.teamScope(tenantId, old.teamId) });
    }
    previous.current = { tenantId, teamId };
  }, [queryClient, teamId, tenantId]);
}
