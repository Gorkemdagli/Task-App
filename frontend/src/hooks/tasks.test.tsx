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

function setAuthenticatedUser(tenant: string | null = tenantId, userId = 'user-1') {
  if (!tenant) {
    useAuthStore.getState().clearAuth();
    return;
  }
  useAuthStore.getState().setAccessToken('token');
  useAuthStore.getState().setUser({
    id: userId,
    displayId: 'AAAAA',
    email: 'user@example.com',
    fullName: 'User',
    role: 'member',
    tenantId: tenant,
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

  const sessionScenarios = [
    { name: 'logout only', kind: 'logout' },
    { name: 'same-user logout/login', kind: 'same-user' },
    { name: 'same-tenant account switch', kind: 'same-tenant-user' },
    { name: 'different-tenant login', kind: 'different-tenant' },
  ] as const;

  it.each(
    sessionScenarios.flatMap((scenario) =>
      (['success', 'failure'] as const).map((outcome) => [scenario.name, scenario.kind, outcome] as const),
    ),
  )('does not invalidate or restore cache after %s delayed %s', async (_name, kind, outcome) => {
      let finishRequest!: (value: { data: Task }) => void;
      let failRequest!: (error: Error) => void;
      vi.spyOn(api, 'patch').mockReturnValue(
        new Promise((resolve, reject) => {
          finishRequest = resolve;
          failRequest = reject;
        }) as never,
      );
      const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
      const detailKey = queryKeys.task.detail(tenantId, taskId);
      const listKey = queryKeys.tasks.list(tenantId, {});
      queryClient.setQueryData(detailKey, task());
      queryClient.setQueryData(listKey, { tasks: [task()], total: 1 });
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
      const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper: wrapper(queryClient) });

      let mutation!: Promise<Task>;
      act(() => {
        mutation = result.current.mutateAsync({ taskId, status: 'done' });
      });
      await waitFor(() => expect(queryClient.getQueryData<Task>(detailKey)?.status).toBe('done'));

      useAuthStore.getState().clearAuth();
      if (kind === 'logout') {
        queryClient.clear();
      } else {
        const currentTenant = kind === 'different-tenant' ? 'tenant-b' : tenantId;
        const currentUser = kind === 'same-user' ? 'user-1' : 'user-2';
        setAuthenticatedUser(currentTenant, currentUser);
        const currentDetailKey = queryKeys.task.detail(currentTenant, taskId);
        const currentListKey = queryKeys.tasks.list(currentTenant, {});
        const userTwoTask = {
          ...task('in_progress'),
          team: { id: 'team-a', name: 'Team', tenantId: currentTenant },
        };
        queryClient.setQueryData(currentDetailKey, userTwoTask);
        queryClient.setQueryData(currentListKey, { tasks: [userTwoTask], total: 1 });
      }

      await act(async () => {
        if (outcome === 'success') {
          finishRequest({ data: task('done') });
          await mutation;
        } else {
          failRequest(new Error('request failed'));
          await expect(mutation).rejects.toThrow('request failed');
        }
      });

      if (kind === 'logout') {
        expect(queryClient.getQueryData(detailKey)).toBeUndefined();
        expect(queryClient.getQueryData(listKey)).toBeUndefined();
      } else if (kind === 'different-tenant') {
        const userTwoTask = {
          ...task('in_progress'),
          team: { id: 'team-a', name: 'Team', tenantId: 'tenant-b' },
        };
        expect(queryClient.getQueryData(queryKeys.task.detail('tenant-b', taskId))).toEqual(userTwoTask);
        expect(queryClient.getQueryData(queryKeys.tasks.list('tenant-b', {}))).toEqual({
          tasks: [userTwoTask],
          total: 1,
        });
        expect(queryClient.getQueryData<Task>(detailKey)?.status).toBe('done');
        expect(queryClient.getQueryData<{ tasks: Task[] }>(listKey)?.tasks[0].status).toBe('done');
      } else {
        const userTwoTask = task('in_progress');
        expect(queryClient.getQueryData(detailKey)).toEqual(userTwoTask);
        expect(queryClient.getQueryData(listKey)).toEqual({ tasks: [userTwoTask], total: 1 });
      }
      expect(invalidate).not.toHaveBeenCalled();
    });

  it('invalidates task queries after a successful current-session optimistic mutation', async () => {
    vi.spyOn(api, 'patch').mockResolvedValue({ data: task('done') } as never);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const detailKey = queryKeys.task.detail(tenantId, taskId);
    queryClient.setQueryData(detailKey, task());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({ taskId, status: 'done' });
    });

    expect(invalidate).toHaveBeenCalled();
  });

  it('checks the session again after awaited snapshot work before optimistic patching', async () => {
    let continueSnapshot!: () => void;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const detailKey = queryKeys.task.detail(tenantId, taskId);
    queryClient.setQueryData(detailKey, task());
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries').mockImplementationOnce(
      () => new Promise<void>((resolve) => { continueSnapshot = () => resolve(); }) as never,
    );
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: task('done') } as never);
    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper: wrapper(queryClient) });

    let mutation!: Promise<Task>;
    act(() => {
      mutation = result.current.mutateAsync({ taskId, status: 'done' });
    });
    await waitFor(() => expect(cancelQueries).toHaveBeenCalled());
    useAuthStore.getState().clearAuth();
    setAuthenticatedUser(tenantId, 'user-2');
    continueSnapshot();

    await act(async () => {
      await expect(mutation).rejects.toThrow('Task mutation session changed');
    });

    expect(queryClient.getQueryData<Task>(detailKey)?.status).toBe('todo');
    expect(patch).not.toHaveBeenCalled();
  });
});
