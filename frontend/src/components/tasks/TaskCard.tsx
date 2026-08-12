import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Task } from '@/hooks/tasks';
import { AssigneeAvatarStack } from './AssigneeAvatarStack';
import { PendingStatusBadge } from './PendingStatusBadge';

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

function formatDeadline(iso: string | null): string {
  if (!iso) return '—';
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDay = new Date(target);
  targetDay.setHours(0, 0, 0, 0);
  const days = Math.round((targetDay.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  if (days === -1) return 'Dün';
  if (days < -1) return `${Math.abs(days)}g geçti`;
  if (days < 7) return `${days}g`;
  return target.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

interface TaskCardProps {
  task: Task;
  draggable?: boolean;
  disabled?: boolean;
  /** Pending badge + sarı border yalnız non-proposer için görünür. */
  currentUserId?: string;
}

export function TaskCard({
  task,
  draggable = false,
  disabled = false,
  currentUserId,
}: TaskCardProps) {
  const isPending = task.pendingStatus !== null && task.pendingProposer?.id !== currentUserId;

  // Pending varken sürükleme kilitli (admin override yoksa)
  const dragEnabled = draggable && !disabled && !isPending;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !dragEnabled,
  });

  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

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
      )}
    >
      <Link
        to={`/tasks/${task.id}`}
        className="block p-3"
        draggable={false}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
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
          {isPending && task.pendingStatus && <PendingStatusBadge status={task.pendingStatus} />}
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
