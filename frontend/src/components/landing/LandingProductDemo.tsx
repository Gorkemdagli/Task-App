import { useEffect, useMemo, useReducer, useRef, type KeyboardEvent } from 'react';
import { LayoutDashboard, ListTodo, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createInitialDemoState,
  demoReducer,
  demoTeams,
  type DemoAction,
  type DemoBeat,
  type DemoPriority,
  type DemoStatus,
  type DemoTask,
  type DemoView,
} from '@/pages/Landing/demo/demoState';

export interface LandingProductDemoProps {
  guidedBeat: DemoBeat;
  onManualInteraction(): void;
}

const views: readonly DemoView[] = ['board', 'tasks'];
const statuses: readonly DemoStatus[] = ['todo', 'in-progress', 'done'];

const viewLabel: Record<DemoView, string> = {
  board: 'Pano',
  tasks: 'Görevler',
};

const statusLabel: Record<DemoStatus, string> = {
  todo: 'Yapılacak',
  'in-progress': 'Yapılıyor',
  done: 'Yapıldı',
};

const priorityLabel: Record<DemoPriority, string> = {
  critical: 'Kritik',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

function TaskButton({
  task,
  selected,
  onSelect,
}: {
  task: DemoTask;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      aria-label={task.title}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full min-w-0 flex-col gap-3 rounded-md border border-landing-border bg-landing-card p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary',
        selected && 'border-landing-primary bg-landing-primary-soft',
      )}
    >
      <span className="text-sm font-semibold leading-snug">{task.title}</span>
      <span className="flex w-full items-center justify-between gap-2 text-xs text-landing-muted">
        <span>{priorityLabel[task.priority]}</span>
        <span className="truncate">{task.assignee}</span>
      </span>
    </button>
  );
}

export function LandingProductDemo({ guidedBeat, onManualInteraction }: LandingProductDemoProps) {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialDemoState);
  const tabRefs = useRef<Record<DemoView, HTMLButtonElement | null>>({
    board: null,
    tasks: null,
  });

  useEffect(() => {
    dispatch({ type: 'apply-guided-beat', beat: guidedBeat });
  }, [guidedBeat]);

  const teamTasks = useMemo(
    () => state.tasks.filter((task) => task.teamId === state.activeTeamId),
    [state.activeTeamId, state.tasks],
  );
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId) ?? null;

  function dispatchManual(
    action: Exclude<DemoAction, { type: 'apply-guided-beat' } | { type: 'reset' }>,
  ) {
    dispatch(action);
    onManualInteraction();
  }

  function selectView(view: DemoView) {
    if (view === state.view) return;
    dispatchManual({ type: 'set-view', view });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentView: DemoView) {
    let nextView: DemoView | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const currentIndex = views.indexOf(currentView);
      nextView = views[(currentIndex + direction + views.length) % views.length];
    } else if (event.key === 'Home') {
      nextView = views[0];
    } else if (event.key === 'End') {
      nextView = views[views.length - 1];
    }

    if (!nextView) return;

    event.preventDefault();
    selectView(nextView);
    tabRefs.current[nextView]?.focus({ preventScroll: true });
  }

  return (
    <div className="landing-product-demo" data-demo-mode={state.mode}>
      <div className="landing-product-demo__toolbar">
        <div role="tablist" aria-label="Demo görünümü" className="landing-demo-tabs">
          {views.map((view) => {
            const Icon = view === 'board' ? LayoutDashboard : ListTodo;

            return (
              <button
                key={view}
                ref={(node) => {
                  tabRefs.current[view] = node;
                }}
                type="button"
                role="tab"
                id={`landing-demo-tab-${view}`}
                aria-controls={`landing-demo-panel-${view}`}
                aria-selected={state.view === view}
                tabIndex={state.view === view ? 0 : -1}
                onClick={() => selectView(view)}
                onKeyDown={(event) => handleTabKeyDown(event, view)}
                className={cn('landing-demo-tab', state.view === view && 'is-active')}
              >
                <Icon aria-hidden />
                <span>{viewLabel[view]}</span>
              </button>
            );
          })}
        </div>

        <Button variant="secondary" type="button" onClick={() => dispatch({ type: 'reset' })}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          Demoyu sıfırla
        </Button>
      </div>

      <div className="landing-product-demo__workspace">
        <aside aria-label="Demo takımları" className="landing-demo-teams">
          <h3>Takımlar</h3>
          <div className="flex flex-col gap-1">
            {demoTeams.map((team) => (
              <button
                key={team.id}
                type="button"
                aria-pressed={state.activeTeamId === team.id}
                onClick={() => {
                  if (team.id !== state.activeTeamId) {
                    dispatchManual({ type: 'select-team', teamId: team.id });
                  }
                }}
                className={cn('landing-demo-team', state.activeTeamId === team.id && 'is-active')}
              >
                {team.name}
              </button>
            ))}
          </div>
        </aside>

        <div className="landing-product-demo__content">
          {state.view === 'board' ? (
            <section
              id="landing-demo-panel-board"
              role="region"
              aria-label="Kanban panosu"
              className="landing-demo-board animate-tab-fade"
            >
              {statuses.map((status) => {
                const tasks = teamTasks.filter((task) => task.status === status);

                return (
                  <section
                    key={status}
                    role="region"
                    aria-label={`${statusLabel[status]} görevleri`}
                    className="landing-demo-column"
                  >
                    <header>
                      <h3>{statusLabel[status]}</h3>
                      <span aria-label={`${tasks.length} görev`}>{tasks.length}</span>
                    </header>
                    <div className="flex flex-col gap-2">
                      {tasks.map((task) => (
                        <TaskButton
                          key={task.id}
                          task={task}
                          selected={state.selectedTaskId === task.id}
                          onSelect={() => dispatchManual({ type: 'select-task', taskId: task.id })}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </section>
          ) : (
            <section
              id="landing-demo-panel-tasks"
              role="region"
              aria-label="Görev listesi"
              className="animate-tab-fade"
            >
              <ul className="landing-demo-list">
                {teamTasks.map((task) => (
                  <li key={task.id}>
                    <TaskButton
                      task={task}
                      selected={state.selectedTaskId === task.id}
                      onSelect={() => dispatchManual({ type: 'select-task', taskId: task.id })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {selectedTask ? (
          <aside aria-label="Görev ayrıntısı" className="landing-demo-inspector">
            <div className="flex items-start justify-between gap-3">
              <h3>{selectedTask.title}</h3>
              <Button
                variant="ghost"
                type="button"
                aria-label="Ayrıntıyı kapat"
                onClick={() => dispatchManual({ type: 'select-task', taskId: null })}
              >
                <X aria-hidden />
              </Button>
            </div>

            <dl className="landing-demo-inspector__meta">
              <div>
                <dt>Sorumlu</dt>
                <dd>{selectedTask.assignee}</dd>
              </div>
              <div>
                <dt>Öncelik</dt>
                <dd>{priorityLabel[selectedTask.priority]}</dd>
              </div>
              <div>
                <dt>Termin</dt>
                <dd>
                  <time dateTime={selectedTask.deadline}>{selectedTask.deadline}</time>
                </dd>
              </div>
              <div>
                <dt>Durum</dt>
                <dd>{statusLabel[selectedTask.status]}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2" aria-label="Görev durumunu değiştir">
              {statuses.map((status) => (
                <Button
                  key={status}
                  variant={selectedTask.status === status ? 'primary' : 'secondary'}
                  type="button"
                  disabled={selectedTask.status === status}
                  onClick={() =>
                    dispatchManual({ type: 'move-task', taskId: selectedTask.id, status })
                  }
                >
                  {statusLabel[status]}
                </Button>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
