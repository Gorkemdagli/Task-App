import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  archivedAt: string | null;
  teamId: string;
  assignerId: string;
  assigneeId: string;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string; tenantId: string };
  assigner: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
  assignee: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
}

export interface ListTasksFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  teamId?: string;
  assigneeId?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

function toQuery(filters: ListTasksFilters | undefined): string {
  if (!filters) return '';
  const sp = new URLSearchParams();
  if (filters.status?.length) sp.set('status', filters.status.join(','));
  if (filters.priority?.length) sp.set('priority', filters.priority.join(','));
  if (filters.teamId) sp.set('teamId', filters.teamId);
  if (filters.assigneeId) sp.set('assigneeId', filters.assigneeId);
  if (filters.deadlineFrom) sp.set('deadlineFrom', filters.deadlineFrom);
  if (filters.deadlineTo) sp.set('deadlineTo', filters.deadlineTo);
  if (filters.includeArchived) sp.set('includeArchived', 'true');
  if (filters.limit) sp.set('limit', String(filters.limit));
  if (filters.offset) sp.set('offset', String(filters.offset));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

// ─── Hooks ────────────────────────────────────────────────────────────

export function useTasks(filters?: ListTasksFilters) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const r = await api.get<{ tasks: Task[]; total: number }>(`/tasks${toQuery(filters)}`);
      return r.data;
    },
  });
}

export function useTask(id: string | undefined) {
  return useQuery<Task>({
    queryKey: ['task', id],
    queryFn: async () => {
      const r = await api.get<Task>(`/tasks/${id}`);
      return r.data;
    },
    enabled: !!id,
  });
}

export function useTaskComments(taskId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery<{ comments: Comment[] }>({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const r = await api.get<{ comments: Comment[] }>(`/tasks/${taskId}/comments`);
      return r.data;
    },
    enabled: !!taskId && (options?.enabled ?? true),
    refetchInterval: () => {
      // Sadece sayfa görünürken poll
      if (typeof document !== 'undefined' && document.hidden) return false;
      return 5000;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      deadline?: string;
      priority: TaskPriority;
      assigneeId: string;
      teamId: string;
    }) => {
      const r = await api.post<Task>('/tasks', input);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskStatus(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { status: TaskStatus }) => {
      const r = await api.patch<Task>(`/tasks/${taskId}/status`, vars);
      return r.data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['task', taskId] });
      const prev = qc.getQueryData<Task>(['task', taskId]);
      if (prev) {
        qc.setQueryData<Task>(['task', taskId], { ...prev, status: vars.status });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['task', taskId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskPriority(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { priority: TaskPriority }) => {
      const r = await api.patch<Task>(`/tasks/${taskId}/priority`, vars);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskFields(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      title?: string;
      description?: string | null;
      deadline?: string | null;
      assigneeId?: string;
    }) => {
      const r = await api.patch<Task>(`/tasks/${taskId}`, vars);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/tasks/${taskId}`);
      return taskId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useCreateComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { body: string }) => {
      const r = await api.post<Comment>(`/tasks/${taskId}/comments`, vars);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
    },
  });
}

export function useTriggerArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await api.post<{ archivedCount: number }>('/admin/tasks/archive-expired');
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
