import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const NOTIFICATIONS_KEY = ['notifications'] as const;

export type NotificationType = 'task_assigned' | 'task_commented' | 'message_received';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  payload: {
    taskId: string;
    taskTitle: string;
    actorId?: string;
    actorName?: string;
  };
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsData {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async (): Promise<NotificationsData> => {
      const res = await api.get('/notifications');
      return res.data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    staleTime: 0,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/read-all');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useLoadMoreNotifications(cursor: string | null | undefined) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'page', cursor ?? 'first'],
    queryFn: async (): Promise<NotificationsData> => {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const res = await api.get(`/notifications${params}`);
      return res.data;
    },
    enabled: Boolean(cursor),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });
}
