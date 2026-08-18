export interface TaskFilterParamValues {
  status?: readonly string[];
  priority?: readonly string[];
  teamId?: string | null;
  assigneeIds?: readonly string[];
  deadlineFrom?: string | null;
  deadlineTo?: string | null;
  includeArchived?: boolean;
}

export function appendTaskFilterParams(
  searchParams: URLSearchParams,
  filters: TaskFilterParamValues,
): URLSearchParams {
  if (filters.status?.length) searchParams.set('status', filters.status.join(','));
  if (filters.priority?.length) searchParams.set('priority', filters.priority.join(','));
  if (filters.teamId) searchParams.set('teamId', filters.teamId);
  if (filters.assigneeIds?.length) {
    searchParams.set('assigneeIds', filters.assigneeIds.join(','));
  }
  if (filters.deadlineFrom) searchParams.set('deadlineFrom', filters.deadlineFrom);
  if (filters.deadlineTo) searchParams.set('deadlineTo', filters.deadlineTo);
  if (filters.includeArchived) searchParams.set('includeArchived', 'true');
  return searchParams;
}
