import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { ListTasksFilters, Task } from './tasks';
import {
  useCreateComment,
  useCreateTask,
  useTask,
  useTasks,
  useUpdateTaskStatus,
} from './tasks';
import { useAuthStore } from '@/stores/authStore';

const tenantId = 'tenant-a';
const taskId = 'task-1';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setAuthenticatedUser(tenant: string | null = tenantId) {
  useAuthStore.setState({
    accessToken: 'token',
    user: tenant
      ? {
          id: 'user-1',
          displayId: 'AAAAA',
          email: 'user@example.com',
          fullName: 'User',
          role: 'member',
          tenantId: tenant,
        }
      : null,
  });
}

function task(status: Task['status'] = 'todo'): Task {
  return {
    id: taskId,
    title: 'Task',
    description: null,
    status,
    priority: 'medium',
    deadline: null,
    archivedAt: null,
    teamId: 'team-a',
    assignerId: 'user-1',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    pendingStatus: null,
    pendingVersion: 0,
    pendingProposedBy: null,
    pendingProposedAt: null,
    pendingProposer: null,
    statusAcks: [],
    team: { id: 'team-a', name: 'Team', tenantId },
    assigner: { id: 'user-1', displayId: 'AAAAA', fullName: 'User', avatarUrl: null },
    assignees: [],
  };
}

describe('task query and mutation hooks', () => {
  beforeEach(() => setAuthenticatedUser());

  afterEach(() => {
    vi.restoreAllMocks();
    setAuthenticatedUser(null);
  });

  it('requests filtered tasks and stores them under the tenant-scoped key', async () => {
    const data = { tasks: [task()], total: 1 };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const filters: ListTasksFilters = {
      status: ['todo'],
      priority: ['high'],
      teamId: 'team-a',
      assigneeIds: ['user-1'],
      deadlineFrom: '2026-09-01',
      deadlineTo: '2026-09-30',
      includeArchived: true,
      limit: 10,
      offset: 20,
    };
    const { result } = renderHook(() => useTasks(filters), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const request = get.mock.calls[0][0] as string;
    const params = new URLSearchParams(request.split('?')[1]);
    expect(request.split('?')[0]).toBe('/tasks');
    expect(Object.fromEntries(params)).toEqual({
      status: 'todo',
      priority: 'high',
      teamId: 'team-a',
      assigneeIds: 'user-1',
      deadlineFrom: '2026-09-01',
      deadlineTo: '2026-09-30',
      includeArchived: 'true',
      limit: '10',
      offset: '20',
    });
    expect(queryClient.getQueryData(queryKeys.tasks.list(tenantId, filters))).toEqual(data);
  });

  it('does not fetch task data when the user has no tenant or task id', () => {
    setAuthenticatedUser(null);
    const get = vi.spyOn(api, 'get');
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useTask(undefined), { wrapper: wrapper(queryClient) });

    expect(result.current.fetchStatus).toBe('idle');
    expect(get).not.toHaveBeenCalled();
  });

  it('fetches task detail into the tenant-and-task cache', async () => {
    const data = task();
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useTask(taskId), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledWith(`/tasks/${taskId}`);
    expect(queryClient.getQueryData(queryKeys.task.detail(tenantId, taskId))).toEqual(data);
  });

  it('creates a task and invalidates only the authenticated tenant cache', async () => {
    const created = task();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: created } as never);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const input = {
      title: 'New task',
      priority: 'medium' as const,
      assigneeIds: ['user-1'],
      teamId: 'team-a',
    };
    const { result } = renderHook(() => useCreateTask(), { wrapper: wrapper(queryClient) });

    let response!: Task;
    await act(async () => {
      response = await result.current.mutateAsync(input);
    });

    expect(response).toEqual(created);
    expect(post).toHaveBeenCalledWith('/tasks', input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tenant(tenantId) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.tenant('tenant-b') });
  });

  it('creates a comment and invalidates only that tenant task comment query', async () => {
    const comment = { id: 'comment-1', taskId, body: 'Hello' };
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: comment } as never);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useCreateComment(taskId), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({ body: 'Hello' });
    });

    expect(post).toHaveBeenCalledWith(`/tasks/${taskId}/comments`, { body: 'Hello' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.task.comments(tenantId, taskId) });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: queryKeys.task.comments('tenant-b', taskId),
    });
  });

  it('optimistically updates task status, then rolls back only this tenant on failure', async () => {
    let rejectRequest!: (error: Error) => void;
    const patch = vi.spyOn(api, 'patch').mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }) as never,
    );
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const detailKey = queryKeys.task.detail(tenantId, taskId);
    const otherTenantKey = queryKeys.task.detail('tenant-b', taskId);
    const listKey = queryKeys.tasks.list(tenantId, {});
    queryClient.setQueryData(detailKey, task());
    queryClient.setQueryData(otherTenantKey, {
      ...task(),
      team: { id: 'team-a', name: 'Team', tenantId: 'tenant-b' },
    });
    queryClient.setQueryData(listKey, { tasks: [task()], total: 1 });
    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper: wrapper(queryClient) });

    let mutation!: Promise<Task>;
    act(() => {
      mutation = result.current.mutateAsync({ taskId, status: 'done' });
    });
    await waitFor(() => expect(queryClient.getQueryData<Task>(detailKey)?.status).toBe('done'));
    expect(queryClient.getQueryData<Task>(otherTenantKey)?.status).toBe('todo');
    expect(queryClient.getQueryData<{ tasks: Task[] }>(listKey)?.tasks[0].status).toBe('done');

    await act(async () => {
      rejectRequest(new Error('request failed'));
      await expect(mutation).rejects.toThrow('request failed');
    });

    expect(patch).toHaveBeenCalledWith(`/tasks/${taskId}/status`, { status: 'done' });
    expect(queryClient.getQueryData<Task>(detailKey)?.status).toBe('todo');
    expect(queryClient.getQueryData<Task>(otherTenantKey)?.status).toBe('todo');
    expect(queryClient.getQueryData<{ tasks: Task[]; total: number }>(listKey)).toEqual({
      tasks: [task()],
      total: 1,
    });
  });
});
