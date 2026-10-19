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
});
