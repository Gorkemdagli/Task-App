import { cn } from '@/lib/utils';
import type { ColumnId } from '@/pages/Landing/data/mockData';

interface StatusDotProps {
  status: ColumnId;
  className?: string;
}

/**
 * Status dot for kanban columns. Uses global status tokens.
 */
export function StatusDot({ status, className }: StatusDotProps) {
  const colorClass: Record<ColumnId, string> = {
    todo: 'bg-status-todo',
    'in-progress': 'bg-status-inprogress',
    done: 'bg-status-done',
  };

  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 rounded-full', colorClass[status], className)}
    />
  );
}
