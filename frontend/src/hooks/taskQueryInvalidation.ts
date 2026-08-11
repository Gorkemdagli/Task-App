import type { QueryClient } from '@tanstack/react-query';

export function invalidateTaskQueries(queryClient: QueryClient, taskId: string) {
  queryClient.invalidateQueries({ queryKey: ['task', taskId] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
}
