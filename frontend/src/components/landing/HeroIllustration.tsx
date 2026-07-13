import { CheckCircle2 } from 'lucide-react';

/**
 * Decorative illustration for the hero. Pure CSS/SVG-free composition so
 * there are no asset weight concerns. The "Task Completed" card is a
 * floating overlay positioned on top of a faux dashboard window.
 */
export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label="TaskFlow dashboard preview with a task completion notification"
      className="relative w-full max-w-xl"
    >
      {/* Faux dashboard window */}
      <div className="overflow-hidden rounded-xl border border-landing-border bg-landing-card shadow-panel">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-landing-border bg-landing-bg-alt px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-priority-high/70" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-priority-medium/70" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-priority-low/70" aria-hidden />
          <span className="ml-3 text-xs text-landing-muted">taskflow.app/dashboard</span>
        </div>

        {/* Faux kanban body */}
        <div className="grid grid-cols-3 gap-3 p-4">
          {[1, 2, 3].map((col) => (
            <div
              key={col}
              className="flex flex-col gap-2 rounded-md bg-landing-bg-alt p-3 border border-landing-border"
            >
              <div className="mb-1 h-2 w-1/3 rounded bg-landing-muted/40" />
              <div className="h-12 rounded bg-landing-card border border-landing-border" />
              {col === 2 && (
                <div className="h-12 rounded bg-landing-card border border-landing-border" />
              )}
              <div className="h-8 rounded bg-landing-card border border-landing-border opacity-70" />
            </div>
          ))}
        </div>
      </div>

      {/* Overlay card — "Task Completed" */}
      <div className="animate-fade-up absolute -right-4 bottom-10 w-64 rounded-lg border border-landing-border bg-landing-card p-4 shadow-widget sm:-right-8">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-priority-low/20">
            <CheckCircle2 className="h-5 w-5 text-priority-low" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold tracking-wide text-priority-low uppercase">
              Success
            </span>
            <span className="truncate text-sm font-semibold">Task Completed</span>
            <span className="truncate text-xs text-landing-muted">Backend API Integration</span>
          </div>
        </div>
      </div>
    </div>
  );
}
