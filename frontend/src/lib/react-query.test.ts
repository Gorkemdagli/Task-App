import { QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from './react-query';
import { clearGlobalError, getGlobalError } from './globalError';

function axiosError(status?: number) {
  return {
    isAxiosError: true,
    response: status === undefined ? undefined : { status },
  };
}

describe('query cache local transient errors', () => {
  beforeEach(() => {
    queryClient.clear();
    clearGlobalError();
  });

  afterEach(() => {
    queryClient.clear();
    clearGlobalError();
  });

  it.each([undefined, 503])('keeps marked transport and server errors local (%s)', async (status) => {
    const error = axiosError(status);
    await expect(queryClient.fetchQuery({
      queryKey: ['local-transient-error', status],
      queryFn: async () => { throw error; },
      meta: { localTransientError: true },
      retry: false,
    })).rejects.toBe(error);

    expect(getGlobalError()).toBeNull();
  });

  it.each([400, 403, 404])('keeps marked client error %s on the global path', async (status) => {
    const error = axiosError(status);
    await expect(queryClient.fetchQuery({
      queryKey: ['global-client-error', status],
      queryFn: async () => { throw error; },
      meta: { localTransientError: true },
      retry: false,
    })).rejects.toBe(error);

    expect(getGlobalError()).not.toBeNull();
  });

  it('keeps unmarked server errors on the global path', async () => {
    const error = axiosError(503);
    await expect(queryClient.fetchQuery({
      queryKey: ['global-server-error'],
      queryFn: async () => { throw error; },
      retry: false,
    })).rejects.toBe(error);

    expect(getGlobalError()).toBe('generic');
  });

  it.each([401, 403, 404, 503])(
    'keeps unobserved speculative task-detail error %s off the global path',
    async (status) => {
      const error = axiosError(status);
      await expect(queryClient.prefetchQuery({
        queryKey: ['tenant', 'tenant-a', 'task', 'task-1'],
        queryFn: async () => { throw error; },
        meta: { speculativeTaskDetailPrefetch: true },
        retry: false,
      })).resolves.toBeUndefined();

      expect(getGlobalError()).toBeNull();
    },
  );

  it.each([
    [401, 'session-expired'],
    [403, 'access-denied'],
    [404, 'not-found'],
  ] as const)('keeps mounted task-detail error %i on the global path', async (status, kind) => {
    const error = axiosError(status);
    const observer = new QueryObserver(queryClient, {
      queryKey: ['tenant', 'tenant-a', 'task', 'task-1'],
      queryFn: async () => { throw error; },
      meta: { speculativeTaskDetailPrefetch: true },
      enabled: false,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});

    try {
      await expect(observer.refetch({ throwOnError: true })).rejects.toBe(error);
      expect(getGlobalError()).toBe(kind);
    } finally {
      unsubscribe();
    }
  });
});
