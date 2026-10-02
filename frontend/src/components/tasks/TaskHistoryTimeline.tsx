import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskHistory, type TaskHistoryItem } from '@/hooks/tasks';

const EVENT_KEYS: Record<string, string> = {
  task_created: 'tasks.history.taskCreated',
  assignee_added: 'tasks.history.assigneeAdded',
  assignee_removed: 'tasks.history.assigneeRemoved',
  status_changed: 'tasks.history.statusChanged',
  task_reopened: 'tasks.history.reopened',
  status_change_requested: 'tasks.history.statusRequested',
  status_change_approved: 'tasks.history.statusApproved',
  status_change_rejected: 'tasks.history.statusRejected',
  priority_changed: 'tasks.history.priorityChanged',
  deadline_changed: 'tasks.history.deadlineChanged',
  task_blocked: 'tasks.history.blocked',
  task_unblocked: 'tasks.history.unblocked',
  file_added: 'tasks.history.fileAdded',
  file_deleted: 'tasks.history.fileDeleted',
};

const COMMENT_EVENT_TYPES = new Set(['comment_added', 'comment_created', 'task_commented']);

function formatTimestamp(createdAt: string, locale: string): string {
  return new Date(createdAt).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function metadataSummary(item: TaskHistoryItem): string | null {
  const metadata = item.metadata;
  if (item.eventType === 'file_added' && typeof metadata.originalName === 'string') {
    return metadata.originalName;
  }
  if (item.eventType === 'file_deleted' && typeof metadata.originalName === 'string') {
    return metadata.originalName;
  }
  if (item.eventType === 'task_blocked' && typeof metadata.blockedReason === 'string') {
    return metadata.blockedReason;
  }
  if (item.eventType === 'assignee_added' || item.eventType === 'assignee_removed') {
    const names = metadata.affectedDisplayNames;
    if (Array.isArray(names) && names.every((name) => typeof name === 'string')) {
      return names.join(', ');
    }
  }
  return null;
}

function eventTone(eventType: string): string {
  if (eventType === 'status_change_approved' || eventType === 'task_reopened') {
    return 'bg-status-done';
  }
  if (eventType === 'status_changed' || eventType === 'status_change_requested') {
    return 'bg-status-inprogress';
  }
  if (eventType === 'file_added' || eventType === 'file_deleted') {
    return 'bg-primary';
  }
  return 'bg-muted-foreground';
}

export function TaskHistoryTimeline({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTaskHistory(taskId);
  const items = (data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => !COMMENT_EVENT_TYPES.has(item.eventType),
  );

  return (
    <section
      aria-labelledby="history-heading"
      className="flex min-h-0 flex-1 flex-col lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
    >
      <h2 id="history-heading" className="mb-3 shrink-0 text-lg font-semibold">
        {t('tasks.history.title')}
      </h2>
      <div
        role="region"
        aria-label={t('tasks.history.aria')}
        tabIndex={0}
        className="max-h-[18rem] flex-1 overflow-y-auto pr-1 focus:outline-none focus:ring-2 focus:ring-primary lg:min-h-0 lg:max-h-none lg:overscroll-contain"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('tasks.history.loading')}</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('tasks.history.error')}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t('tasks.history.empty')}</p>
        ) : (
          <ol className="relative ml-2 space-y-4 border-l border-border pl-4">
            {items.map((item) => {
              const label = t(EVENT_KEYS[item.eventType] ?? 'tasks.history.updated');
              const summary = metadataSummary(item);
              return (
                <li key={item.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card ${eventTone(item.eventType)}`}
                  />
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.actor?.name ?? t('tasks.history.system')} · {formatTimestamp(item.createdAt, i18n.language === 'en' ? 'en-US' : 'tr-TR')}
                  </p>
                  {summary && <p className="mt-1 truncate text-xs text-muted-foreground">{summary}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFetchingNextPage && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
          {isFetchingNextPage ? t('tasks.history.loadingMore') : t('tasks.history.loadMore')}
        </button>
      )}
    </section>
  );
}
