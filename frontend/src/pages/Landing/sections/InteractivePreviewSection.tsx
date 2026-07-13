import { useState } from 'react';
import { LayoutDashboard, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KanbanColumn } from '@/components/landing/KanbanColumn';
import {
  projects,
  kanbanColumns,
  milestones,
  type MilestoneStatus,
} from '@/pages/Landing/data/mockData';

type ViewId = 'kanban' | 'timeline';

const statusLabel: Record<MilestoneStatus, string> = {
  'on-track': 'On Track',
  pending: 'Pending',
  'at-risk': 'At Risk',
};

const statusColor: Record<MilestoneStatus, string> = {
  'on-track': 'bg-priority-low text-white',
  pending: 'bg-landing-bg-alt text-landing-muted border border-landing-border',
  'at-risk': 'bg-priority-high text-white',
};

export function InteractivePreviewSection() {
  const [view, setView] = useState<ViewId>('kanban');

  return (
    <section
      id="interactive-app-preview"
      aria-labelledby="preview-title"
      className="flex min-h-screen flex-col justify-center bg-landing-bg-alt py-16 md:py-24"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 md:px-6">
        <header className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 id="preview-title" className="text-3xl font-bold tracking-tight md:text-4xl">
            Interactive App Preview
          </h2>
          <p className="text-landing-muted">
            Explore the power of TaskFlow directly from the landing page. Click tabs to switch
            views.
          </p>
        </header>

        {/* View tabs */}
        <div
          role="tablist"
          aria-label="Preview view"
          className="mx-auto inline-flex rounded-lg border border-landing-border bg-landing-card p-1"
        >
          {(['kanban', 'timeline'] as const).map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                view === id
                  ? 'bg-landing-primary-soft text-landing-primary'
                  : 'text-landing-muted hover:text-landing-text',
              )}
            >
              {id === 'kanban' ? (
                <LayoutDashboard className="h-4 w-4" aria-hidden />
              ) : (
                <Calendar className="h-4 w-4" aria-hidden />
              )}
              <span className="capitalize">{id}</span>
            </button>
          ))}
        </div>

        {/* View body */}
        <div className="overflow-hidden rounded-xl border border-landing-border bg-landing-card shadow-panel">
          <div className="flex min-h-[480px] flex-col md:flex-row">
            {/* Persistent sidebar */}
            <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-landing-border bg-landing-bg-alt p-4 md:w-56 md:border-b-0 md:border-r">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-landing-muted uppercase">
                Projects
              </h3>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                    project.active
                      ? 'bg-landing-primary-soft text-landing-primary font-semibold'
                      : 'text-landing-muted hover:bg-landing-card-hover',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-2 w-2 rounded-full',
                      project.active ? 'bg-landing-primary' : 'bg-landing-muted/50',
                    )}
                  />
                  {project.name}
                </div>
              ))}
            </aside>

            {/* View content (cross-fades on tab switch) */}
            <div className="flex-1 p-6" key={view}>
              {view === 'kanban' ? (
                <div className="grid h-full animate-tab-fade grid-cols-1 gap-4 md:grid-cols-3">
                  {kanbanColumns.map((col) => (
                    <KanbanColumn key={col.id} column={col} />
                  ))}
                </div>
              ) : (
                <ul className="flex animate-tab-fade flex-col gap-3">
                  {milestones.map((m) => (
                    <li
                      key={m.title}
                      className="flex items-center justify-between rounded-md border border-landing-border bg-landing-bg-alt p-4"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{m.title}</span>
                        <span className="text-sm text-landing-muted">{m.date}</span>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase',
                          statusColor[m.status],
                        )}
                      >
                        {statusLabel[m.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
