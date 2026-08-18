import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useAuthStore } from '../stores/authStore';
import {
  type BaseNotificationPayload,
  type MessageNotificationPayload,
  type TaskNotificationPayload,
  type TaskNotificationType,
  type NotificationType,
} from '../lib/notificationCopy';

export const NOTIFICATIONS_PAGE_SIZE = 10;
export const NOTIFICATIONS_KEY = queryKeys.notifications('tenant-test');

interface NotificationBase {
  id: string;
  readAt: string | null;
  createdAt: string;
}

export type NotificationItem =
  | (NotificationBase & {
      type: TaskNotificationType;
      payload: TaskNotificationPayload;
    })
  | (NotificationBase & {
      type: 'message_received';
      payload: MessageNotificationPayload;
    });

export interface NotificationsPageData {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}

export function useNotifications() {
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const notificationsKey = queryKeys.notifications(tenantId ?? 'tenantless');
  return useInfiniteQuery({
    queryKey: notificationsKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<NotificationsPageData> => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : '';
      const response = await api.get(`/notifications?limit=${NOTIFICATIONS_PAGE_SIZE}${cursor}`);
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    staleTime: 0,
    enabled: Boolean(tenantId),
  });
}

type NotificationCache = InfiniteData<NotificationsPageData>;

function updateNotificationCache(
  current: NotificationCache | undefined,
  updater: (page: NotificationsPageData) => NotificationsPageData,
): NotificationCache | undefined {
  if (!current) return current;
  return { ...current, pages: current.pages.map(updater) };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const notificationsKey = queryKeys.notifications(tenantId ?? 'tenantless');
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}/read`);
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationsKey });
      const previous = queryClient.getQueryData<NotificationCache>(notificationsKey);
      const readAt = new Date().toISOString();
      const wasUnread = previous?.pages.some((page) =>
        page.items.some((item) => item.id === notificationId && item.readAt === null),
      );

      queryClient.setQueryData<NotificationCache>(notificationsKey, (current) =>
        updateNotificationCache(current, (page) => ({
          ...page,
          unreadCount: wasUnread ? Math.max(0, page.unreadCount - 1) : page.unreadCount,
          items: page.items.map((item) =>
            item.id === notificationId && item.readAt === null ? { ...item, readAt } : item,
          ),
        })),
      );
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const notificationsKey = queryKeys.notifications(tenantId ?? 'tenantless');
  return useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/read-all');
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationsKey });
      const previous = queryClient.getQueryData<NotificationCache>(notificationsKey);
      const readAt = new Date().toISOString();
      queryClient.setQueryData<NotificationCache>(notificationsKey, (current) =>
        updateNotificationCache(current, (page) => ({
          ...page,
          unreadCount: 0,
          items: page.items.map((item) => (item.readAt === null ? { ...item, readAt } : item)),
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export type { BaseNotificationPayload, NotificationType };
