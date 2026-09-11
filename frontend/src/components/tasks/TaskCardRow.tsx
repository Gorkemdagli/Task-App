import { Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Task, TaskPriority } from '@/hooks/tasks';
import { AssigneeAvatarStack } from './AssigneeAvatarStack';
import { PendingStatusBadge } from './PendingStatusBadge';
import { formatCalendarDateDisplay, utcTodayCalendarDate } from '@/lib/calendarDate';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
};

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

const STATUS_COLOR: Record<Task['status'], string> = {
  todo: 'bg-secondary text-secondary-foreground',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-status-done/15 text-status-done',
};

const TASK_GRID =
  'lg:grid-cols-[minmax(14rem,1.7fr)_minmax(7rem,.85fr)_5rem_minmax(6rem,.75fr)_5rem_6.5rem]';

export function TaskListHeader() {
  return (
    <div
      data-testid="task-list-header"
      className={cn(
        'hidden border-b border-border bg-secondary/30 px-4 py-2 text-xs font-medium text-secondary-foreground lg:grid lg:items-center lg:gap-3',
        TASK_GRID,
      )}
    >
      <span>Başlık</span>
      <span>Durum</span>
      <span>Öncelik</span>
      <span>Takım</span>
      <span>Atanan</span>
      <span>Bitiş Tarihi</span>
    </div>
  );
}

function StatusBadge({ status }: { status: Task['status'] }) {
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
      {STATUS_LABEL[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[priority])}
    >
      <Flag className="h-3.5 w-3.5 fill-current" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

interface TaskCardRowProps {
  task: Task;
}

export function TaskCardRow({ task }: TaskCardRowProps) {
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
              Arşiv
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-secondary-foreground lg:hidden">
          {task.team.name}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs lg:block">
        <span className="text-secondary-foreground lg:hidden">Durum</span>
        <div className="flex items-center gap-2">
          <StatusBadge status={task.status} />
          {isPending && task.pendingStatus && <PendingStatusBadge status={task.pendingStatus} />}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">Öncelik</span>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">Takım</span>
        <span className="truncate text-xs text-foreground">{task.team.name}</span>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">Atanan</span>
        <AssigneeAvatarStack assignees={task.assignees} max={2} size="sm" />
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-xs text-secondary-foreground lg:hidden">Bitiş Tarihi</span>
        <span
          className={cn(
            'text-xs text-secondary-foreground',
            overdue && 'font-medium text-priority-high',
          )}
        >
          {formatCalendarDateDisplay(task.deadline)}
        </span>
      </div>
    </Link>
  );
}
