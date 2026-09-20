import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import {
  useDeleteTaskFile,
  useDownloadTaskFile,
  useTaskFiles,
  useTaskHistory,
  useUpdateTaskFields,
  useUploadTaskFile,
} from './tasks';

const tenantId = 'tenant-a';
const taskId = 'task-1';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setAuthenticatedUser() {
  useAuthStore.setState({
    accessToken: 'token',
    user: {
      id: 'user-1',
      displayId: 'AAAAA',
      email: 'user@example.com',
      fullName: 'User',
      role: 'member',
      tenantId,
    },
  });
}

const historyItem = (id: string) => ({
  id,
  eventType: 'status_changed',
  createdAt: `2026-09-20T10:0${id.slice(-1)}:00.000Z`,
  actor: { id: 'user-1', name: 'User' },
  metadata: {},
});

describe('task file and history hooks', () => {
  beforeEach(() => {
    setAuthenticatedUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches files into the tenant-and-task cache', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { files: [] } } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useTaskFiles(taskId), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledWith(`/tasks/${taskId}/files`);
    expect(queryClient.getQueryData(queryKeys.task.files(tenantId, taskId))).toEqual({ files: [] });
  });

  it('uploads a file as FormData and invalidates files and history', async () => {
    const file = new File(['brief'], 'brief.txt', { type: 'text/plain' });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} } as never);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useUploadTaskFile(), { wrapper: wrapper(queryClient) });

    result.current.mutate({ taskId, file });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const formData = post.mock.calls[0][1] as FormData;
    expect(post).toHaveBeenCalledWith(`/tasks/${taskId}/files`, expect.any(FormData), expect.anything());
    expect(formData.get('file')).toBe(file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.task.files(tenantId, taskId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.task.history(tenantId, taskId) });
  });

  it('deletes a file and does not invalidate comments', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined } as never);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDeleteTaskFile(), { wrapper: wrapper(queryClient) });

    result.current.mutate({ taskId, fileId: 'file-1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(del).toHaveBeenCalledWith(`/tasks/${taskId}/files/file-1`);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.task.files(tenantId, taskId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.task.history(tenantId, taskId) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.task.comments(tenantId, taskId) });
  });

  it('opens the returned signed URL without caching it', async () => {
    const signedUrl = 'https://signed.example/task-file';
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { url: signedUrl, expiresAt: '2026-09-20T11:00:00.000Z' },
    } as never);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const { result } = renderHook(() => useDownloadTaskFile(), { wrapper: wrapper(queryClient) });

    result.current.mutate({ taskId, fileId: 'file-1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(post).toHaveBeenCalledWith(`/tasks/${taskId}/files/file-1/download`);
    expect(open).toHaveBeenCalledWith(signedUrl, '_blank', 'noopener,noreferrer');
    expect(result.current.data).toBeUndefined();
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(signedUrl);
  });

  it('updates task detail fields and keeps tenant/detail invalidation', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} } as never);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useUpdateTaskFields(), { wrapper: wrapper(queryClient) });

    result.current.mutate({
      taskId,
      scopeItems: ['Scope'],
      targetAudience: 'Audience',
      expectedOutput: 'Output',
      tags: ['tag'],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(patch).toHaveBeenCalledWith(`/tasks/${taskId}`, {
      scopeItems: ['Scope'],
      targetAudience: 'Audience',
      expectedOutput: 'Output',
      tags: ['tag'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.task.detail(tenantId, taskId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tenant(tenantId) });
  });

  it('appends history pages without duplicate items', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { items: [historyItem('event-1'), historyItem('event-2')], nextCursor: 'cursor-1' },
      } as never)
      .mockResolvedValueOnce({
        data: { items: [historyItem('event-2'), historyItem('event-3')], nextCursor: null },
      } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useTaskHistory(taskId), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(get).toHaveBeenNthCalledWith(1, `/tasks/${taskId}/history?limit=50`);
    expect(get).toHaveBeenNthCalledWith(2, `/tasks/${taskId}/history?limit=50&cursor=cursor-1`);
    expect(result.current.data?.pages.flatMap((page) => page.items).map((item) => item.id)).toEqual([
      'event-1',
      'event-2',
      'event-3',
    ]);
  });
});
