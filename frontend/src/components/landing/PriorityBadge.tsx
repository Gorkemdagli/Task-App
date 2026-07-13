import { cn } from '@/lib/utils';
import type { Priority } from '@/pages/Landing/data/mockData';

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

/**
 * Color-coded pill. Uses global priority tokens (not landing-scoped) so
 * the badges read identically inside the kanban preview across the app.
 */
export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const palette: Record<Priority, string> = {
    Critical: 'bg-priority-high text-white',
    High: 'bg-priority-high/80 text-white',
    Medium: 'bg-priority-medium text-black',
    Low: 'bg-priority-low text-black',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase',
        palette[priority],
        className,
      )}
    >
      {priority}
    </span>
  );
}
