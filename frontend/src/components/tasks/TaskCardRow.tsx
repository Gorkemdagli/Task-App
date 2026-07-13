import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Task, TaskPriority } from '@/hooks/tasks';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: '🔴 Yüksek',
  medium: '🟡 Orta',
  low: '🟢 Düşük',
};

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

function formatDeadline(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

interface TaskCardRowProps {
  task: Task;
}

export function TaskCardRow({ task }: TaskCardRowProps) {
  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

  return (
    <Link
      to={`/tasks/${task.id}`}
      data-testid={`task-row-${task.id}`}
      className={cn(
        'flex items-center gap-4 border-b border-border bg-card px-4 py-3 transition-colors hover:bg-secondary',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs">{PRIORITY_LABEL[task.priority]}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <h3 className="truncate text-sm font-medium text-foreground">{task.title}</h3>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Takım: {task.team.name}</span>
          <span>·</span>
          <span>{STATUS_LABEL[task.status]}</span>
          {task.archivedAt && (
            <>
              <span>·</span>
              <span className="text-primary">Arşiv</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className={cn('text-muted-foreground', overdue && 'text-priority-high font-medium')}>
          Son: {formatDeadline(task.deadline)}
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
          {task.assignee.fullName.charAt(0)}
        </span>
      </div>
    </Link>
  );
}
