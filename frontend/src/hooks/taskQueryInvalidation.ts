import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export function invalidateTaskQueries(queryClient: QueryClient, tenantId: string, taskId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.task.detail(tenantId, taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
}
