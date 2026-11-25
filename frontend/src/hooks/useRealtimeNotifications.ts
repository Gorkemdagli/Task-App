import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 30_000;
const WS_PATH = '/api/v1/realtime/ws';

function isNotificationEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return event.v === 1 &&
    typeof event.eventId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.eventId) &&
    typeof event.occurredAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(event.occurredAt) &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    event.type === 'notification.created';
}

export function useRealtimeNotifications(): void {
  const queryClient = useQueryClient();
  const accessTokenPresent = useAuthStore((state) => Boolean(state.accessToken));
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration);

  useEffect(() => {
    if (!accessTokenPresent || !userId || !tenantId) return;

    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const notificationKey = queryKeys.notifications(tenantId, userId);

    const scheduleRetry = () => {
      if (!active || retryTimer) return;
      const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    const connect = async () => {
      try {
        const response = await api.post<{ ticket?: unknown }>('/realtime/ticket');
        if (!active) return;
        const ticket = response.data?.ticket;
        if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
          scheduleRetry();
          return;
        }

        const url = new URL(WS_PATH, window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const currentSocket = new WebSocket(url, ['taskflow.v1', `ticket.${ticket}`]);
        socket = currentSocket;
        currentSocket.onopen = () => {
          if (!active || socket !== currentSocket) return;
          void queryClient.invalidateQueries({ queryKey: notificationKey });
          stableTimer = setTimeout(() => { attempt = 0; }, 30_000);
        };
        currentSocket.onmessage = (message) => {
          if (!active || socket !== currentSocket || typeof message.data !== 'string') return;
          try {
            if (isNotificationEvent(JSON.parse(message.data))) {
              void queryClient.invalidateQueries({ queryKey: notificationKey });
            }
          } catch {
            // Ignore malformed server frames; REST remains the source of truth.
          }
        };
        currentSocket.onclose = () => {
          if (!active || socket !== currentSocket) return;
          socket = null;
          if (stableTimer) clearTimeout(stableTimer);
          scheduleRetry();
        };
      } catch (error) {
        if (!active) return;
        if ((error as { response?: { status?: number } })?.response?.status === 404) return;
        scheduleRetry();
      }
    };

    void connect();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (stableTimer) clearTimeout(stableTimer);
      const currentSocket = socket;
      socket = null;
      if (currentSocket) {
        currentSocket.onclose = null;
        currentSocket.onmessage = null;
        currentSocket.onopen = null;
        currentSocket.close();
      }
    };
  }, [accessTokenPresent, queryClient, sessionGeneration, tenantId, userId]);
}
