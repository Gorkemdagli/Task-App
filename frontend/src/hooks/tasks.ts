import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appendTaskFilterParams } from '../lib/taskFilterParams';
import { useAuthStore } from '../stores/authStore';
import { invalidateTaskQueries } from './taskQueryInvalidation';
import { patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from '../lib/taskCache';

// ─── Types ────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskAssignee {
  userId: string;
  assignedAt: string;
  user: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
}

export interface TaskStatusAck {
  id: string;
  userId: string;
  proposedStatus: TaskStatus;
  pendingVersion: number;
  ackedAt: string;
}

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
  createdAt: string;
  updatedAt: string;
  pendingStatus: TaskStatus | null;
  pendingVersion: number;
  pendingProposedBy: string | null;
  pendingProposedAt: string | null;
  pendingProposer: {
    id: string;
    displayId: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
  statusAcks: TaskStatusAck[];
  team: { id: string; name: string; tenantId: string };
  assigner: { id: string; displayId: string; fullName: string; avatarUrl: string | null };
  assignees: TaskAssignee[];
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
  assigneeIds?: string[];
  deadlineFrom?: string;
  deadlineTo?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

function toQuery(filters: ListTasksFilters | undefined): string {
  if (!filters) return '';
  const sp = appendTaskFilterParams(new URLSearchParams(), filters);
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
      assigneeIds: string[];
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

/** Hook argümansız: taskId mutate({taskId, ...}) içinde. Drag-drop gibi
 *  geçici state'ten çağrılan yerlerde hook re-mount riskini önler. */
export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { taskId: string; status: TaskStatus }) => {
      const r = await api.patch<Task>(`/tasks/${vars.taskId}/status`, { status: vars.status });
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, vars.taskId);
      patchTaskCaches(qc, vars.taskId, (task) => ({ ...task, status: vars.status }));
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot && ctx.taskId) restoreTaskCaches(qc, ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      invalidateTaskQueries(qc, vars.taskId);
    },
  });
}

/** Multi-assignee task için status teklifi. Backend admin ise direkt apply, değilse pending oluşturur. */
export function useProposeTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { taskId: string; status: TaskStatus }) => {
      const r = await api.post<Task>(`/tasks/${vars.taskId}/status/propose`, {
        status: vars.status,
      });
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, vars.taskId);
      const actorId = useAuthStore.getState().user?.id ?? null;
      const actor = useAuthStore.getState().user;
      patchTaskCaches(qc, vars.taskId, (task) => {
        if (task.assignees.length === 1) {
          return {
            ...task,
            status: vars.status,
            pendingStatus: null,
            pendingProposedBy: null,
            pendingProposedAt: null,
            pendingProposer: null,
            statusAcks: [],
          };
        }
        return {
          ...task,
          pendingStatus: vars.status,
          pendingProposedBy: actorId,
          pendingProposedAt: new Date().toISOString(),
          pendingProposer: actor
            ? {
                id: actor.id,
                displayId: actor.displayId,
                fullName: actor.fullName,
                avatarUrl: null,
              }
            : task.pendingProposer,
        };
      });
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot && ctx.taskId) restoreTaskCaches(qc, ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      invalidateTaskQueries(qc, vars.taskId);
    },
  });
}

/** Pending status teklifini ack'le. Tüm assignees ack edince DB status güncellenir. */
export function useAckTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { taskId: string; pendingVersion: number }) => {
      const r = await api.post<{ task: Task; applied: boolean }>(
        `/tasks/${vars.taskId}/status/ack`,
        { pendingVersion: vars.pendingVersion },
      );
      return r.data;
    },
    onSettled: (_d, _e, vars) => {
      invalidateTaskQueries(qc, vars.taskId);
    },
  });
}

/** Pending status teklifini iptal et. Proposer veya admin. */
export function useCancelTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const r = await api.post<Task>(`/tasks/${taskId}/status/cancel`);
      return r.data;
    },
    onSettled: (_d, _e, taskId) => {
      invalidateTaskQueries(qc, taskId);
    },
  });
}

export function useUpdateTaskPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { taskId: string; priority: TaskPriority }) => {
      const r = await api.patch<Task>(`/tasks/${vars.taskId}/priority`, {
        priority: vars.priority,
      });
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, vars.taskId);
      patchTaskCaches(qc, vars.taskId, (task) => ({ ...task, priority: vars.priority }));
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.snapshot && ctx.taskId) restoreTaskCaches(qc, ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      invalidateTaskQueries(qc, vars.taskId);
    },
  });
}

export function useUpdateTaskFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      taskId: string;
      title?: string;
      description?: string | null;
      deadline?: string | null;
      assigneeIds?: string[];
    }) => {
      const { taskId, ...body } = vars;
      const r = await api.patch<Task>(`/tasks/${taskId}`, body);
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, vars.taskId);
      patchTaskCaches(qc, vars.taskId, (task) => ({
        ...task,
        ...(vars.title !== undefined && { title: vars.title }),
        ...(vars.description !== undefined && { description: vars.description }),
        ...(vars.deadline !== undefined && { deadline: vars.deadline }),
        ...(vars.assigneeIds !== undefined && {
          assignees: task.assignees.filter((assignee) =>
            vars.assigneeIds?.includes(assignee.userId),
          ),
        }),
      }));
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.snapshot && ctx.taskId) restoreTaskCaches(qc, ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      invalidateTaskQueries(qc, vars.taskId);
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
    onMutate: async (taskId) => {
      const snapshot = await snapshotTaskCaches(qc, taskId);
      patchTaskCaches(qc, taskId, () => null);
      return { snapshot, taskId };
    },
    onError: (_e, _taskId, ctx) => {
      if (ctx?.snapshot && ctx.taskId) restoreTaskCaches(qc, ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, taskId) => {
      invalidateTaskQueries(qc, taskId);
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
