import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Task, TaskPriority } from '@/hooks/tasks';
import { AssigneeAvatarStack } from './AssigneeAvatarStack';
import { PendingStatusBadge } from './PendingStatusBadge';
import { formatCalendarDateDisplay, utcTodayCalendarDate } from '@/lib/calendarDate';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
};

const STATUS_COLOR: Record<Task['status'], string> = {
  todo: 'bg-secondary text-secondary-foreground',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-status-done/15 text-status-done',
};

const TASK_GRID =
  'lg:grid-cols-[minmax(14rem,1.7fr)_minmax(7rem,.85fr)_5rem_minmax(6rem,.75fr)_5rem_6.5rem]';

export function TaskListHeader() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="task-list-header"
      className={cn(
        'hidden border-b border-border bg-secondary/30 px-4 py-2 text-xs font-medium text-secondary-foreground lg:grid lg:items-center lg:gap-3',
        TASK_GRID,
      )}
    >
      <span>{t('tasks.columns.title')}</span>
      <span>{t('tasks.columns.status')}</span>
      <span>{t('tasks.columns.priority')}</span>
      <span>{t('tasks.columns.team')}</span>
      <span>{t('tasks.columns.assignee')}</span>
      <span>{t('tasks.columns.deadline')}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: Task['status'] }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs',
        STATUS_COLOR[status],
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'todo' && 'bg-status-todo',
          status === 'in_progress' && 'bg-status-inprogress',
          status === 'done' && 'bg-status-done',
        )}
      />
      {t(`tasks.status.${status}`)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[priority])}
    >
      <Flag className="h-3.5 w-3.5 fill-current" aria-hidden />
      {t(`tasks.priority.${priority}`)}
    </span>
  );
}

interface TaskCardRowProps {
  task: Task;
}

export function TaskCardRow({ task }: TaskCardRowProps) {
  const { t, i18n } = useTranslation();
  const overdue =
    task.deadline !== null && task.deadline < utcTodayCalendarDate() && task.status !== 'done';
  const isPending = task.pendingStatus !== null;

  return (
    <Link
      to={`/tasks/${task.id}`}
      data-testid={`task-row-${task.id}`}
      data-pending={isPending ? 'true' : undefined}
      className={cn(
        'grid gap-3 border-b border-border bg-card px-4 py-3 transition-colors last:border-b-0 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary lg:items-center',
        TASK_GRID,
        isPending && 'bg-yellow-500/5',
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-medium text-foreground">{task.title}</h3>
          {task.archivedAt && (
            <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
              {t('tasks.columns.archive')}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-secondary-foreground lg:hidden">
          {task.team.name}
        </p>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 text-xs lg:block">
        <span className="text-secondary-foreground lg:hidden">{t('tasks.columns.status')}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          {isPending && task.pendingStatus && <PendingStatusBadge status={task.pendingStatus} />}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">{t('tasks.columns.priority')}</span>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">{t('tasks.columns.team')}</span>
        <span className="truncate text-xs text-foreground">{task.team.name}</span>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">{t('tasks.columns.assignee')}</span>
        <AssigneeAvatarStack assignees={task.assignees} max={2} size="sm" />
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">{t('tasks.columns.deadline')}</span>
        <span
          className={cn(
            'text-xs text-secondary-foreground',
            overdue && 'font-medium text-priority-high',
          )}
        >
          {formatCalendarDateDisplay(task.deadline, i18n.language)}
        </span>
      </div>
    </Link>
  );
}
