import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { AxiosProgressEvent } from 'axios';
import { api } from '../lib/api';
import { appendTaskFilterParams } from '../lib/taskFilterParams';
import { useAuthStore } from '../stores/authStore';
import { queryKeys } from '../lib/queryKeys';
import {
  invalidateTaskFilesAndHistoryQueries,
  invalidateTaskQueries,
} from './taskQueryInvalidation';
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
  scopeItems?: string[];
  targetAudience?: string | null;
  expectedOutput?: string | null;
  tags?: string[];
  status: TaskStatus;
  priority: TaskPriority;
  isBlocked?: boolean;
  blockedSince?: string | null;
  blockedReason?: string | null;
  deadline: string | null;
  estimateMinutes?: number | null;
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

export interface TaskFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader: { id: string; name: string };
  canDelete: boolean;
}

export interface TaskHistoryItem {
  id: string;
  eventType: string;
  createdAt: string;
  actor: { id: string; name: string } | null;
  metadata: Record<string, unknown>;
}

export interface TaskHistoryPage {
  items: TaskHistoryItem[];
  nextCursor: string | null;
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
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery({
    queryKey: queryKeys.tasks.list(tenantId ?? 'tenantless', filters),
    queryFn: async () => {
      const r = await api.get<{ tasks: Task[]; total: number }>(`/tasks${toQuery(filters)}`);
      return r.data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useTask(id: string | undefined) {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery<Task>({
    queryKey: queryKeys.task.detail(tenantId ?? 'tenantless', id ?? 'none'),
    queryFn: async () => {
      const r = await api.get<Task>(`/tasks/${id}`);
      return r.data;
    },
    enabled: Boolean(tenantId && id),
  });
}

export function useTaskComments(taskId: string | undefined, options?: { enabled?: boolean }) {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery<{ comments: Comment[] }>({
    queryKey: queryKeys.task.comments(tenantId ?? 'tenantless', taskId ?? 'none'),
    queryFn: async () => {
      const r = await api.get<{ comments: Comment[] }>(`/tasks/${taskId}/comments`);
      return r.data;
    },
    enabled: Boolean(tenantId && taskId) && (options?.enabled ?? true),
    refetchInterval: () => {
      // Sadece sayfa görünürken poll
      if (typeof document !== 'undefined' && document.hidden) return false;
      return 5000;
    },
  });
}

export function useTaskFiles(taskId: string | undefined) {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useQuery<{ files: TaskFile[] }>({
    queryKey: queryKeys.task.files(tenantId ?? 'tenantless', taskId ?? 'none'),
    queryFn: async () => {
      const r = await api.get<{ files: TaskFile[] }>(`/tasks/${taskId}/files`);
      return r.data;
    },
    enabled: Boolean(tenantId && taskId),
  });
}

const TASK_HISTORY_PAGE_SIZE = 50;

function dedupeTaskHistory(
  data: InfiniteData<TaskHistoryPage, string | null>,
): InfiniteData<TaskHistoryPage, string | null> {
  const seen = new Set<string>();
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    })),
  };
}

export function useTaskHistory(taskId: string | undefined) {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useInfiniteQuery({
    queryKey: queryKeys.task.history(tenantId ?? 'tenantless', taskId ?? 'none'),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<TaskHistoryPage> => {
      const params = new URLSearchParams({ limit: String(TASK_HISTORY_PAGE_SIZE) });
      if (pageParam) params.set('cursor', pageParam);
      const r = await api.get<TaskHistoryPage>(`/tasks/${taskId}/history?${params.toString()}`);
      return r.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: dedupeTaskHistory,
    enabled: Boolean(tenantId && taskId),
  });
}

export function useUploadTaskFile() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: {
      taskId: string;
      file: File;
      onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
    }) => {
      const formData = new FormData();
      formData.append('file', vars.file);
      const r = await api.post<TaskFile>(`/tasks/${vars.taskId}/files`, formData, {
        onUploadProgress: vars.onUploadProgress,
      });
      return r.data;
    },
    onSuccess: (_data, vars) => {
      if (tenantId) invalidateTaskFilesAndHistoryQueries(qc, tenantId, vars.taskId);
    },
  });
}

export function useDownloadTaskFile() {
  return useMutation({
    mutationFn: async (vars: { taskId: string; fileId: string }) => {
      const r = await api.post<{ url: string; expiresAt: string }>(
        `/tasks/${vars.taskId}/files/${vars.fileId}/download`,
      );
      if (typeof window !== 'undefined') window.open(r.data.url, '_blank', 'noopener,noreferrer');
    },
  });
}

export function useDeleteTaskFile() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { taskId: string; fileId: string }) => {
      await api.delete(`/tasks/${vars.taskId}/files/${vars.fileId}`);
      return vars;
    },
    onSuccess: (_data, vars) => {
      if (tenantId) invalidateTaskFilesAndHistoryQueries(qc, tenantId, vars.taskId);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      deadline?: string;
      estimateMinutes?: number | null;
      priority: TaskPriority;
      assigneeIds: string[];
      teamId: string;
    }) => {
      const r = await api.post<Task>('/tasks', input);
      return r.data;
    },
    onSuccess: () => {
      if (tenantId) qc.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
    },
  });
}

/** Hook argümansız: taskId mutate({taskId, ...}) içinde. Drag-drop gibi
 *  geçici state'ten çağrılan yerlerde hook re-mount riskini önler. */
export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { taskId: string; status: TaskStatus }) => {
      const r = await api.patch<Task>(`/tasks/${vars.taskId}/status`, { status: vars.status });
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId);
      patchTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId, (task) => ({
        ...task,
        status: vars.status,
      }));
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot && ctx.taskId)
        restoreTaskCaches(qc, tenantId ?? 'tenantless', ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

/** Multi-assignee task için status teklifi. Backend admin ise direkt apply, değilse pending oluşturur. */
export function useProposeTaskStatus() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { taskId: string; status: TaskStatus }) => {
      const r = await api.post<Task>(`/tasks/${vars.taskId}/status/propose`, {
        status: vars.status,
      });
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId);
      const actorId = useAuthStore.getState().user?.id ?? null;
      const actor = useAuthStore.getState().user;
      patchTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId, (task) => {
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
      if (ctx?.snapshot && ctx.taskId)
        restoreTaskCaches(qc, tenantId ?? 'tenantless', ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

/** Pending status teklifini ack'le. Tüm assignees ack edince DB status güncellenir. */
export function useAckTaskStatus() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { taskId: string; pendingVersion: number }) => {
      const r = await api.post<{ task: Task; applied: boolean }>(
        `/tasks/${vars.taskId}/status/ack`,
        { pendingVersion: vars.pendingVersion },
      );
      return r.data;
    },
    onSettled: (_d, _e, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

/** Pending status teklifini iptal et. Proposer veya admin. */
export function useCancelTaskStatus() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (taskId: string) => {
      const r = await api.post<Task>(`/tasks/${taskId}/status/cancel`);
      return r.data;
    },
    onSettled: (_d, _e, taskId) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, taskId);
    },
  });
}

export function useUpdateTaskPriority() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { taskId: string; priority: TaskPriority }) => {
      const r = await api.patch<Task>(`/tasks/${vars.taskId}/priority`, {
        priority: vars.priority,
      });
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId);
      patchTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId, (task) => ({
        ...task,
        priority: vars.priority,
      }));
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.snapshot && ctx.taskId)
        restoreTaskCaches(qc, tenantId ?? 'tenantless', ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

export function useUpdateTaskBlocked() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: {
      taskId: string;
      isBlocked: boolean;
      blockedReason?: string | null;
    }) => {
      const { taskId, ...body } = vars;
      const r = await api.patch<Task>(`/tasks/${taskId}/block`, body);
      return r.data;
    },
    onSettled: (_data, _error, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

export function useUpdateTaskFields() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: {
      taskId: string;
      title?: string;
      description?: string | null;
      scopeItems?: string[];
      targetAudience?: string | null;
      expectedOutput?: string | null;
      tags?: string[];
      deadline?: string | null;
      estimateMinutes?: number | null;
      assigneeIds?: string[];
    }) => {
      const { taskId, ...body } = vars;
      const r = await api.patch<Task>(`/tasks/${taskId}`, body);
      return r.data;
    },
    onMutate: async (vars) => {
      const snapshot = await snapshotTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId);
      patchTaskCaches(qc, tenantId ?? 'tenantless', vars.taskId, (task) => ({
        ...task,
        ...(vars.title !== undefined && { title: vars.title }),
        ...(vars.description !== undefined && { description: vars.description }),
        ...(vars.scopeItems !== undefined && { scopeItems: vars.scopeItems }),
        ...(vars.targetAudience !== undefined && { targetAudience: vars.targetAudience }),
        ...(vars.expectedOutput !== undefined && { expectedOutput: vars.expectedOutput }),
        ...(vars.tags !== undefined && { tags: vars.tags }),
        ...(vars.deadline !== undefined && { deadline: vars.deadline }),
        ...(vars.estimateMinutes !== undefined && { estimateMinutes: vars.estimateMinutes }),
        ...(vars.assigneeIds !== undefined && {
          assignees: task.assignees.filter((assignee) =>
            vars.assigneeIds?.includes(assignee.userId),
          ),
        }),
      }));
      return { snapshot, taskId: vars.taskId };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.snapshot && ctx.taskId)
        restoreTaskCaches(qc, tenantId ?? 'tenantless', ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { taskId: string; deadline: string }) => {
      const r = await api.post<Task>(`/tasks/${vars.taskId}/restore`, {
        deadline: vars.deadline,
      });
      return r.data;
    },
    onSettled: (_data, _error, vars) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, vars.taskId);
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/tasks/${taskId}`);
      return taskId;
    },
    onMutate: async (taskId) => {
      const snapshot = await snapshotTaskCaches(qc, tenantId ?? 'tenantless', taskId);
      patchTaskCaches(qc, tenantId ?? 'tenantless', taskId, () => null);
      return { snapshot, taskId };
    },
    onError: (_e, _taskId, ctx) => {
      if (ctx?.snapshot && ctx.taskId)
        restoreTaskCaches(qc, tenantId ?? 'tenantless', ctx.taskId, ctx.snapshot);
    },
    onSettled: (_d, _e, taskId) => {
      if (tenantId) invalidateTaskQueries(qc, tenantId, taskId);
    },
  });
}

export function useCreateComment(taskId: string) {
  const qc = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  return useMutation({
    mutationFn: async (vars: { body: string }) => {
      const r = await api.post<Comment>(`/tasks/${taskId}/comments`, vars);
      return r.data;
    },
    onSuccess: () => {
      if (tenantId) qc.invalidateQueries({ queryKey: queryKeys.task.comments(tenantId, taskId) });
    },
  });
}
