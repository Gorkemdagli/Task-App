import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import type { TaskStatus, TaskPriority } from '@/hooks/tasks';
import { appendTaskFilterParams } from '@/lib/taskFilterParams';

export interface TaskFilters {
  status: TaskStatus[];
  displayStatus: TaskStatus | null;
  priority: TaskPriority[];
  teamId: string | null;
  assigneeIds: string[];
  deadline: 'all' | 'overdue' | 'today' | 'week' | 'month' | 'custom';
  deadlineFrom: string | null;
  deadlineTo: string | null;
  includeArchived: boolean;
  page: number;
}

export const EMPTY_FILTERS: TaskFilters = {
  status: [],
  displayStatus: null,
  priority: [],
  teamId: null,
  assigneeIds: [],
  deadline: 'all',
  deadlineFrom: null,
  deadlineTo: null,
  includeArchived: false,
  page: 1,
};

function readFromSearch(sp: URLSearchParams): TaskFilters {
  const status = sp.get('status')?.split(',').filter(Boolean) as TaskStatus[] | undefined;
  const rawDisplayStatus = sp.get('displayStatus');
  const displayStatus =
    status?.length === 1 && status[0] === rawDisplayStatus &&
    ['todo', 'in_progress', 'done'].includes(rawDisplayStatus ?? '')
      ? rawDisplayStatus as TaskStatus
      : null;
  const priority = sp.get('priority')?.split(',').filter(Boolean) as TaskPriority[] | undefined;
  const assigneeIds = sp.get('assigneeIds')?.split(',').filter(Boolean) ?? [];
  const rawPage = sp.get('page');
  const parsedPage = rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    status: status ?? [],
    displayStatus,
    priority: priority ?? [],
    teamId: sp.get('teamId'),
    assigneeIds,
    deadline: (sp.get('deadline') as TaskFilters['deadline']) || 'all',
    deadlineFrom: sp.get('deadlineFrom'),
    deadlineTo: sp.get('deadlineTo'),
    includeArchived: sp.get('includeArchived') === 'true',
    page: Number.isSafeInteger(parsedPage) ? parsedPage : 1,
  };
}

function writeToSearch(filters: TaskFilters): URLSearchParams {
  const sp = appendTaskFilterParams(new URLSearchParams(), filters);
  if (filters.displayStatus) sp.set('displayStatus', filters.displayStatus);
  if (filters.deadline && filters.deadline !== 'all') sp.set('deadline', filters.deadline);
  if (filters.page > 1) sp.set('page', String(filters.page));
  return sp;
}

export function useTaskFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFromSearch(searchParams), [searchParams]);

  const updateFilters = (next: TaskFilters) => {
    const statusChanged = next.status.join(',') !== filters.status.join(',');
    setSearchParams(
      writeToSearch({ ...next, displayStatus: statusChanged ? null : next.displayStatus, page: 1 }),
      { replace: true },
    );
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const setPage = (page: number) => {
    setSearchParams(writeToSearch({ ...filters, page }), { replace: true });
  };

  return { filters, updateFilters, resetFilters, setPage };
}
