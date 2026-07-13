import { PriorityBadge } from './PriorityBadge';
import { StatusDot } from './StatusDot';
import type { KanbanColumn as KanbanColumnType } from '@/pages/Landing/data/mockData';

interface KanbanColumnProps {
  column: KanbanColumnType;
}

/**
 * Kanban column rendered inside the InteractivePreviewSection.
 * Static (no drag-drop) — preview only.
 */
export function KanbanColumn({ column }: KanbanColumnProps) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-lg bg-landing-bg-alt p-3 border border-landing-border">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusDot status={column.id} />
          <h4 className="text-xs font-semibold tracking-wide text-landing-muted uppercase">
            {column.title}
          </h4>
        </div>
        <span className="rounded-full bg-landing-primary-soft px-2 py-0.5 text-xs font-semibold text-landing-primary">
          {column.tasks.length}
        </span>
      </header>

      <ul className="flex flex-col gap-2 overflow-hidden">
        {column.tasks.map((task) => (
          <li key={task.id} className="rounded-md bg-landing-card p-3 border border-landing-border">
            <p className="text-sm font-medium leading-snug">{task.title}</p>
            <div className="mt-2 flex items-center justify-between">
              <PriorityBadge priority={task.priority} />
              <span className="text-xs text-landing-muted">{task.assignee}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
