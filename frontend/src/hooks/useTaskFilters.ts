import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import type { TaskStatus, TaskPriority } from '@/hooks/tasks';
import { appendTaskFilterParams } from '@/lib/taskFilterParams';

export interface TaskFilters {
  status: TaskStatus[];
  priority: TaskPriority[];
  teamId: string | null;
  assigneeIds: string[];
  deadline: 'all' | 'overdue' | 'today' | 'week' | 'month' | 'custom';
  deadlineFrom: string | null;
  deadlineTo: string | null;
  includeArchived: boolean;
}

export const EMPTY_FILTERS: TaskFilters = {
  status: [],
  priority: [],
  teamId: null,
  assigneeIds: [],
  deadline: 'all',
  deadlineFrom: null,
  deadlineTo: null,
  includeArchived: false,
};

function readFromSearch(sp: URLSearchParams): TaskFilters {
  const status = sp.get('status')?.split(',').filter(Boolean) as TaskStatus[] | undefined;
  const priority = sp.get('priority')?.split(',').filter(Boolean) as TaskPriority[] | undefined;
  const assigneeIds = sp.get('assigneeIds')?.split(',').filter(Boolean) ?? [];
  return {
    status: status ?? [],
    priority: priority ?? [],
    teamId: sp.get('teamId'),
    assigneeIds,
    deadline: (sp.get('deadline') as TaskFilters['deadline']) || 'all',
    deadlineFrom: sp.get('deadlineFrom'),
    deadlineTo: sp.get('deadlineTo'),
    includeArchived: sp.get('includeArchived') === 'true',
  };
}

function writeToSearch(filters: TaskFilters): URLSearchParams {
  const sp = appendTaskFilterParams(new URLSearchParams(), filters);
  if (filters.deadline && filters.deadline !== 'all') sp.set('deadline', filters.deadline);
  return sp;
}

export function useTaskFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFromSearch(searchParams), [searchParams]);

  const updateFilters = (next: TaskFilters) => {
    setSearchParams(writeToSearch(next), { replace: true });
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return { filters, updateFilters, resetFilters };
}
