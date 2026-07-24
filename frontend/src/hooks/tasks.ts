import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

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
  pendingProposedBy: string | null;
  pendingProposedAt: string | null;
  pendingProposer: { id: string; displayId: string; fullName: string; avatarUrl: string | null } | null;
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
  const sp = new URLSearchParams();
  if (filters.status?.length) sp.set('status', filters.status.join(','));
  if (filters.priority?.length) sp.set('priority', filters.priority.join(','));
  if (filters.teamId) sp.set('teamId', filters.teamId);
  if (filters.assigneeIds?.length) sp.set('assigneeIds', filters.assigneeIds.join(','));
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
      await qc.cancelQueries({ queryKey: ['task', vars.taskId] });
      const prev = qc.getQueryData<Task>(['task', vars.taskId]);
      if (prev) {
        qc.setQueryData<Task>(['task', vars.taskId], { ...prev, status: vars.status });
      }
      return { prev, taskId: vars.taskId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev && ctx.taskId) qc.setQueryData(['task', ctx.taskId], ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Multi-assignee task için status teklifi. Backend admin ise direkt apply, değilse pending oluşturur. */
export function useProposeTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { taskId: string; status: TaskStatus }) => {
      const r = await api.post<Task>(`/tasks/${vars.taskId}/status/propose`, { status: vars.status });
      return r.data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['task', vars.taskId] });
      const prev = qc.getQueryData<Task>(['task', vars.taskId]);
      // Optimistic: pending status set + pendingProposedBy set → isProposer=true olur,
      // refetch bitmeden önce PendingAckModal proposera flash etmez.
      const actorId = useAuthStore.getState().user?.id ?? null;
      if (prev) {
        qc.setQueryData<Task>(['task', vars.taskId], {
          ...prev,
          pendingStatus: vars.status,
          pendingProposedBy: actorId,
          pendingProposedAt: new Date().toISOString(),
        });
      }
      return { prev, taskId: vars.taskId };
    },
    onError: (_e, _v, ctx) => {
      // Sessiz revert
      if (ctx?.prev && ctx.taskId) qc.setQueryData(['task', ctx.taskId], ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Pending status teklifini ack'le. Tüm assignees ack edince DB status güncellenir. */
export function useAckTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const r = await api.post<{ task: Task; applied: boolean }>(`/tasks/${taskId}/status/ack`);
      return r.data;
    },
    onSettled: (_d, _e, taskId) => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { taskId: string; priority: TaskPriority }) => {
      const r = await api.patch<Task>(`/tasks/${vars.taskId}/priority`, { priority: vars.priority });
      return r.data;
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] });
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
