import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import {
  NOTIFICATIONS_KEY,
  useLoadMoreNotifications,
  useMarkAllRead,
  useNotifications,
} from './useNotifications';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useNotifications', () => {
  let getSpy: MockInstance;

  beforeEach(() => {
    getSpy = vi.spyOn(api, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('fetches GET /notifications and returns data', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [
          {
            id: '1',
            type: 'task_assigned',
            payload: { taskId: 't1', taskTitle: 'A' },
            readAt: null,
            createdAt: '2026-07-16T00:00:00Z',
          },
        ],
        unreadCount: 1,
        nextCursor: null,
      },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.unreadCount).toBe(1);
    expect(result.current.data?.items).toHaveLength(1);
    expect(getSpy).toHaveBeenCalledWith('/notifications');
  });

  it('uses 30s refetchInterval', async () => {
    getSpy.mockResolvedValue({
      data: { items: [], unreadCount: 0, nextCursor: null },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const obs = qc.getQueryCache().find({ queryKey: NOTIFICATIONS_KEY });
    const opts = obs?.options as unknown as { refetchInterval?: number };
    expect(opts?.refetchInterval).toBe(30_000);
  });
});

describe('useMarkAllRead', () => {
  let patchSpy: MockInstance;

  beforeEach(() => {
    patchSpy = vi.spyOn(api, 'patch');
  });

  afterEach(() => {
    patchSpy.mockRestore();
  });

  it('calls PATCH /notifications/read-all', async () => {
    patchSpy.mockResolvedValue({ data: null } as never);

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: wrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(patchSpy).toHaveBeenCalledWith('/notifications/read-all');
  });

  it('invalidates notifications cache on success', async () => {
    patchSpy.mockResolvedValue({ data: null } as never);

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: wrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NOTIFICATIONS_KEY });
  });
});

describe('useLoadMoreNotifications', () => {
  let getSpy: MockInstance;

  beforeEach(() => {
    getSpy = vi.spyOn(api, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('appends with cursor and returns page data', async () => {
    getSpy.mockResolvedValue({
      data: {
        items: [
          {
            id: '2',
            type: 'task_commented',
            payload: { taskId: 't2', taskTitle: 'B' },
            readAt: null,
            createdAt: '2026-07-16T00:01:00Z',
          },
        ],
        unreadCount: 2,
        nextCursor: 'cursor-abc',
      },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useLoadMoreNotifications('cursor-xyz'), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.nextCursor).toBe('cursor-abc');
    expect(getSpy).toHaveBeenCalledWith('/notifications?cursor=cursor-xyz');
  });

  it('is disabled when cursor is null', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useLoadMoreNotifications(null), {
      wrapper: wrapper(qc),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getSpy).not.toHaveBeenCalled();
  });
});
