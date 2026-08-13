import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@/hooks/tasks';

export interface TaskListData {
  tasks: Task[];
  total: number;
}

export interface TaskCacheSnapshot {
  detail: Task | undefined;
  lists: Array<[readonly unknown[], TaskListData | undefined]>;
}

function matchesFilters(task: Task, filters: unknown): boolean {
  if (!filters || typeof filters !== 'object') return true;
  const value = filters as Record<string, unknown>;
  const status = value.status as Task['status'][] | undefined;
  const priority = value.priority as Task['priority'][] | undefined;
  const assigneeIds = value.assigneeIds as string[] | undefined;

  if (status?.length && !status.includes(task.status)) return false;
  if (priority?.length && !priority.includes(task.priority)) return false;
  if (typeof value.teamId === 'string' && task.teamId !== value.teamId) return false;
  if (
    assigneeIds?.length &&
    !task.assignees.some((assignee) => assigneeIds.includes(assignee.userId))
  ) {
    return false;
  }
  if (
    typeof value.deadlineFrom === 'string' &&
    (task.deadline === null || task.deadline < value.deadlineFrom)
  ) {
    return false;
  }
  if (
    typeof value.deadlineTo === 'string' &&
    (task.deadline === null || task.deadline > value.deadlineTo)
  ) {
    return false;
  }
  if (value.includeArchived !== true && task.archivedAt !== null) return false;
  return true;
}

function cachedLists(
  queryClient: QueryClient,
): Array<[readonly unknown[], TaskListData | undefined]> {
  return queryClient.getQueriesData<TaskListData>({ queryKey: ['tasks'] });
}

export async function snapshotTaskCaches(
  queryClient: QueryClient,
  taskId: string,
): Promise<TaskCacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: ['task', taskId] });
  await queryClient.cancelQueries({ queryKey: ['tasks'] });
  return {
    detail: queryClient.getQueryData<Task>(['task', taskId]),
    lists: cachedLists(queryClient),
  };
}

export function patchTaskCaches(
  queryClient: QueryClient,
  taskId: string,
  updater: (task: Task) => Task | null,
): void {
  const detail = queryClient.getQueryData<Task>(['task', taskId]);
  if (detail) {
    const next = updater(detail);
    if (next) queryClient.setQueryData(['task', taskId], next);
    else queryClient.removeQueries({ queryKey: ['task', taskId], exact: true });
  }

  for (const [queryKey, data] of cachedLists(queryClient)) {
    if (!data) continue;
    const index = data.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) continue;
    const nextTask = updater(data.tasks[index]);
    const filters = queryKey[1];
    const shouldKeep = nextTask !== null && matchesFilters(nextTask, filters);
    if (!shouldKeep) {
      queryClient.setQueryData(queryKey, {
        tasks: data.tasks.filter((task) => task.id !== taskId),
        total: Math.max(0, data.total - 1),
      });
    } else {
      queryClient.setQueryData(queryKey, {
        ...data,
        tasks: data.tasks.map((task) => (task.id === taskId ? nextTask : task)),
      });
    }
  }
}

export function restoreTaskCaches(
  queryClient: QueryClient,
  taskId: string,
  snapshot: TaskCacheSnapshot,
): void {
  if (snapshot.detail) queryClient.setQueryData(['task', taskId], snapshot.detail);
  else queryClient.removeQueries({ queryKey: ['task', taskId], exact: true });
  for (const [queryKey, data] of snapshot.lists) {
    if (data) queryClient.setQueryData(queryKey, data);
    else queryClient.removeQueries({ queryKey, exact: true });
  }
}
