import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useRealtimeNotifications } from './useRealtimeNotifications';

const ticket = 'a'.repeat(43);

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string | URL, public protocols: string[]) {
    MockWebSocket.instances.push(this);
  }
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useRealtimeNotifications', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ticket } } as never);
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'user-1', displayId: 'AAAAA', email: 'user@example.com',
        fullName: 'User', role: 'member', tenantId: 'tenant-1',
      },
    });
  });

  afterEach(() => {
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens with a fresh ticket, reconciles notifications, ignores malformed frames, and closes on unmount', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { unmount } = renderHook(() => useRealtimeNotifications(), { wrapper: wrapper(queryClient) });

    await act(async () => {});
    expect(api.post).toHaveBeenCalledWith('/realtime/ticket');
    const socket = MockWebSocket.instances[0];
    expect(socket.protocols).toEqual(['taskflow.v1', `ticket.${ticket}`]);
    expect(String(socket.url)).toBe('ws://localhost:3000/api/v1/realtime/ws');

    act(() => socket.onopen?.());
    const queryKey = queryKeys.notifications('tenant-1', 'user-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey });
    invalidate.mockClear();
    act(() => socket.onmessage?.({ data: '{bad json' }));
    act(() => socket.onmessage?.({ data: JSON.stringify({ v: 2, type: 'notification.created' }) }));
    expect(invalidate).not.toHaveBeenCalled();
    act(() => socket.onmessage?.({
      data: JSON.stringify({
        v: 1, eventId: 'd9428888-122b-4d89-a788-4cb3db405f31',
        occurredAt: '2026-11-22T10:00:00.000Z', type: 'notification.created',
      }),
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey });

    unmount();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('gets a new ticket after disconnect and stops retrying when tickets are disabled', async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ticket } } as never);
    const { unmount } = renderHook(() => useRealtimeNotifications(), {
      wrapper: wrapper(new QueryClient()),
    });
    await act(async () => {});
    act(() => MockWebSocket.instances[0].onclose?.());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(post).toHaveBeenCalledTimes(2);
    expect(MockWebSocket.instances).toHaveLength(2);
    unmount();

    vi.restoreAllMocks();
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 404 } });
    const disabled = renderHook(() => useRealtimeNotifications(), {
      wrapper: wrapper(new QueryClient()),
    });
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.post).toHaveBeenCalledTimes(1);
    disabled.unmount();
  });

  it('does not open a socket when an outstanding ticket resolves after the session changes', async () => {
    let resolveTicket!: (value: { data: { ticket: string } }) => void;
    vi.spyOn(api, 'post').mockReturnValue(new Promise((resolve) => { resolveTicket = resolve; }) as never);
    const { unmount } = renderHook(() => useRealtimeNotifications(), {
      wrapper: wrapper(new QueryClient()),
    });

    act(() => useAuthStore.getState().clearAuth());
    await act(async () => { resolveTicket({ data: { ticket } }); });
    expect(MockWebSocket.instances).toHaveLength(0);
    unmount();
  });

  it('closes the old account socket and opens a new session connection', async () => {
    const { unmount } = renderHook(() => useRealtimeNotifications(), {
      wrapper: wrapper(new QueryClient()),
    });
    await act(async () => {});
    const oldSocket = MockWebSocket.instances[0];

    act(() => useAuthStore.getState().establishSession('next-token', {
      id: 'user-2', displayId: 'BBBBB', email: 'next@example.com',
      fullName: 'Next User', role: 'member', tenantId: 'tenant-2',
    }));
    await act(async () => {});

    expect(oldSocket.close).toHaveBeenCalledOnce();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(MockWebSocket.instances).toHaveLength(2);
    unmount();
  });
});
