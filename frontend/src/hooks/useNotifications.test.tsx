import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  NOTIFICATIONS_KEY,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationsPageData,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
} from './useNotifications';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const page = (
  items: NotificationsPageData['items'],
  unreadCount: number,
  nextCursor: string | null,
) => ({
  items,
  unreadCount,
  nextCursor,
});

describe('useNotifications', () => {
  let getSpy: MockInstance;

  beforeEach(() => {
    getSpy = vi.spyOn(api, 'get');
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'user-1',
        displayId: 'AAAAA',
        email: 'user@example.com',
        fullName: 'User',
        role: 'member',
        tenantId: 'tenant-test',
      },
    });
  });

  afterEach(() => getSpy.mockRestore());

  it('fetches first page with limit=10', async () => {
    getSpy.mockResolvedValue({ data: page([], 0, null) } as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(`/notifications?limit=${NOTIFICATIONS_PAGE_SIZE}`);
  });

  it('fetches next cursor only after fetchNextPage', async () => {
    getSpy
      .mockResolvedValueOnce({ data: page([], 2, 'cursor-2') } as never)
      .mockResolvedValueOnce({ data: page([], 2, null) } as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSpy).toHaveBeenCalledTimes(1);
    await result.current.fetchNextPage();
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
    expect(getSpy).toHaveBeenLastCalledWith('/notifications?limit=10&cursor=cursor-2');
  });

  it('uses visible-tab polling only', async () => {
    getSpy.mockResolvedValue({ data: page([], 0, null) } as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = qc.getQueryCache().find({ queryKey: NOTIFICATIONS_KEY });
    const options = query?.options as unknown as {
      refetchInterval?: number;
      refetchIntervalInBackground?: boolean;
    };
    expect(options.refetchInterval).toBe(30_000);
    expect(options.refetchIntervalInBackground).toBe(false);
  });
});

describe('notification mutations', () => {
  let patchSpy: MockInstance;

  beforeEach(() => {
    patchSpy = vi.spyOn(api, 'patch');
  });

  afterEach(() => patchSpy.mockRestore());

  function seed(qc: QueryClient) {
    const data: InfiniteData<NotificationsPageData, string | null> = {
      pages: [
        page(
          [
            {
              id: 'n1',
              type: 'task_assigned',
              payload: { taskId: 't1', taskTitle: 'Task 1' },
              readAt: null,
              createdAt: '2026-08-13T00:00:00Z',
            },
          ],
          2,
          'c2',
        ),
        page(
          [
            {
              id: 'n2',
              type: 'message_received',
              payload: {},
              readAt: null,
              createdAt: '2026-08-12T00:00:00Z',
            },
          ],
          2,
          null,
        ),
      ],
      pageParams: [null, 'c2'],
    };
    qc.setQueryData(NOTIFICATIONS_KEY, data);
  }

  it('optimistically marks one item and decrements every cached page counter', async () => {
    let resolvePatch!: () => void;
    patchSpy.mockReturnValue(new Promise<void>((resolve) => (resolvePatch = resolve)) as never);
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    seed(qc);
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: wrapper(qc) });

    result.current.mutate('n1');
    await waitFor(() => {
      const data = qc.getQueryData<InfiniteData<NotificationsPageData>>(NOTIFICATIONS_KEY)!;
      expect(data.pages[0].items[0].readAt).not.toBeNull();
      expect(data.pages.map((p) => p.unreadCount)).toEqual([1, 1]);
    });
    expect(patchSpy).toHaveBeenCalledWith('/notifications/n1/read');
    resolvePatch();
  });

  it('rolls back single-read optimistic state on failure', async () => {
    patchSpy.mockRejectedValue(new Error('fail'));
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    seed(qc);
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: wrapper(qc) });

    result.current.mutate('n1');
    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = qc.getQueryData<InfiniteData<NotificationsPageData>>(NOTIFICATIONS_KEY)!;
    expect(data.pages[0].items[0].readAt).toBeNull();
    expect(data.pages.map((p) => p.unreadCount)).toEqual([2, 2]);
  });

  it('optimistically marks all cached items read and invalidates after success', async () => {
    patchSpy.mockResolvedValue({ data: null } as never);
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    seed(qc);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: wrapper(qc) });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = qc.getQueryData<InfiniteData<NotificationsPageData>>(NOTIFICATIONS_KEY)!;
    expect(data.pages.every((p) => p.unreadCount === 0)).toBe(true);
    expect(data.pages.every((p) => p.items.every((item) => item.readAt !== null))).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NOTIFICATIONS_KEY });
  });
});
