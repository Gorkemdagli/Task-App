import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Task } from '@/hooks/tasks';
import { AssigneeAvatarStack } from './AssigneeAvatarStack';
import { PendingStatusBadge } from './PendingStatusBadge';
import { formatCalendarDateDisplay, utcTodayCalendarDate } from '@/lib/calendarDate';

const PRIORITY_BORDER: Record<Task['priority'], string> = {
  high: 'border-l-priority-high',
  medium: 'border-l-priority-medium',
  low: 'border-l-priority-low',
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const PRIORITY_BG: Record<Task['priority'], string> = {
  high: 'bg-priority-high text-white',
  medium: 'bg-priority-medium text-black',
  low: 'bg-priority-low text-black',
};

function calendarDayDistance(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000,
  );
}

function formatDeadline(value: string | null): string {
  if (!value) return '—';
  const days = calendarDayDistance(utcTodayCalendarDate(), value);
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  if (days === -1) return 'Dün';
  if (days < -1) return `${Math.abs(days)}g geçti`;
  if (days < 7) return `${days}g`;
  return formatCalendarDateDisplay(value);
}

interface TaskCardProps {
  task: Task;
  draggable?: boolean;
  disabled?: boolean;
  /** Pending badge + sarı border yalnız non-proposer için görünür. */
  currentUserId?: string;
  showTeam?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export function TaskCard({
  task,
  draggable = false,
  disabled = false,
  currentUserId,
  showTeam = false,
  selected = false,
  onSelect,
}: TaskCardProps) {
  const isPending = task.pendingStatus !== null && task.pendingProposer?.id !== currentUserId;

  // Pending varken sürükleme kilitli (admin override yoksa)
  const dragEnabled = draggable && !disabled && !isPending;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !dragEnabled,
  });

  const overdue =
    task.deadline !== null && task.deadline < utcTodayCalendarDate() && task.status !== 'done';

  const handleRef = (node: HTMLElement | null) => {
    setNodeRef(node);
  };

  return (
    <div
      ref={handleRef}
      {...(dragEnabled ? listeners : {})}
      {...(dragEnabled ? attributes : {})}
      data-testid={`task-card-${task.id}`}
      data-priority={task.priority}
      data-pending={isPending ? 'true' : undefined}
      className={cn(
        'group relative block rounded-md border border-border border-l-4 bg-card text-card-foreground shadow-card transition-colors hover:border-primary/50',
        PRIORITY_BORDER[task.priority],
        isDragging && 'opacity-50',
        disabled && 'cursor-not-allowed opacity-60',
        dragEnabled && 'cursor-grab active:cursor-grabbing',
        isPending && 'border-yellow-500/60 bg-yellow-500/5',
        selected && 'ring-1 ring-primary',
      )}
    >
      <Link
        to={`/tasks/${task.id}`}
        className="block p-3"
        draggable={false}
        onClick={(e) => {
          if (isDragging || onSelect) e.preventDefault();
          if (onSelect && !isDragging) onSelect();
        }}
        aria-current={selected ? 'true' : undefined}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium',
              PRIORITY_BG[task.priority],
            )}
          >
            {PRIORITY_LABEL[task.priority]}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {isPending && task.pendingStatus && <PendingStatusBadge status={task.pendingStatus} />}
            {showTeam && (
              <span
                data-testid={`task-team-${task.id}`}
                className="truncate rounded-sm border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {task.team.name}
              </span>
            )}
          </span>
        </div>
        <h3 className="mb-1 line-clamp-2 text-sm font-medium text-foreground">{task.title}</h3>
        {task.description && (
          <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={cn(overdue && 'text-priority-high font-medium')}>
            📅 {formatDeadline(task.deadline)}
          </span>
          <span className="flex items-center gap-1 truncate">
            <AssigneeAvatarStack assignees={task.assignees} max={2} size="sm" />
            {task.assignees.length === 1 && (
              <span className="truncate">{task.assignees[0].user.fullName}</span>
            )}
          </span>
        </div>
      </Link>
    </div>
  );
}
