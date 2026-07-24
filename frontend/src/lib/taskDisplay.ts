import type { Task, TaskStatus } from '@/hooks/tasks';

/**
 * Requester kendi ekranında card'ı yeni kolonda görsün — diğer assignees orijinal
 * kolonda kalsın. Cache manipülasyonu yerine display-level türetim: server
 * invalidation cache'i ezse bile tutarlı (pendingStatus set, status değişmemiş —
 * requester için yine pendingStatus döner).
 */
export function getDisplayStatus(
  task: Task,
  currentUserId: string | undefined,
): TaskStatus {
  if (
    task.pendingStatus &&
    currentUserId &&
    task.pendingProposer?.id === currentUserId
  ) {
    return task.pendingStatus;
  }
  return task.status;
}

/**
 * Pending badge + sarı border yalnız non-proposer için görünür. Requester
 * kendi gönderdiği için bu dekorasyon gereksiz.
 */
export function isPendingForViewer(
  task: Task,
  currentUserId: string | undefined,
): boolean {
  return task.pendingStatus !== null && task.pendingProposer?.id !== currentUserId;
}
