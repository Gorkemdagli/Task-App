import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export function invalidateTaskFilesAndHistoryQueries(
  queryClient: QueryClient,
  tenantId: string,
  taskId: string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.task.files(tenantId, taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.task.history(tenantId, taskId) });
}

export function invalidateTaskQueries(queryClient: QueryClient, tenantId: string, taskId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.task.detail(tenantId, taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
}
