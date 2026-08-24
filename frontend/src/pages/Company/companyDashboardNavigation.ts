import { appendTaskFilterParams, type TaskFilterParamValues } from '@/lib/taskFilterParams';

type DashboardStatus = 'todo' | 'in_progress' | 'done';
type DashboardPriority = 'low' | 'medium' | 'high';

function buildTasksUrl(filters: TaskFilterParamValues): string {
  const params = appendTaskFilterParams(new URLSearchParams(), filters);
  const query = params.toString();
  return query ? `/tasks?${query}` : '/tasks';
}

export function buildStatusTasksUrl(status: DashboardStatus, teamId: string | null): string {
  return buildTasksUrl({ status: [status], teamId });
}

export function buildPriorityTasksUrl(priority: DashboardPriority, teamId: string | null): string {
  return buildTasksUrl({ status: ['todo', 'in_progress'], priority: [priority], teamId });
}

export function buildMemberTasksUrl(userId: string, teamId: string | null): string {
  return buildTasksUrl({ teamId, assigneeIds: [userId] });
}

export function buildTeamTasksUrl(teamId: string): string {
  return buildTasksUrl({ teamId });
}
