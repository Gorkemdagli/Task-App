import { useEffect, useMemo, useReducer, useRef, type KeyboardEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
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

const columnId = (status: DemoStatus) => `landing-demo-column-${status}`;

function isDemoStatus(value: unknown): value is DemoStatus {
  return statuses.includes(value as DemoStatus);
}

const demoKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.code)) return undefined;

  const currentStatus = context.over?.data.current?.status ?? context.active?.data.current?.status;
  if (!isDemoStatus(currentStatus)) return undefined;

  const direction = event.code === 'ArrowRight' ? 1 : -1;
  const nextIndex = Math.min(
    statuses.length - 1,
    Math.max(0, statuses.indexOf(currentStatus) + direction),
  );
  const nextRect = context.droppableRects.get(columnId(statuses[nextIndex]));

  if (!nextRect) return undefined;

  return {
    x: nextRect.left + nextRect.width / 2,
    y: nextRect.top + Math.min(nextRect.height / 2, 80),
  };
};

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
  draggable = true,
  onSelect,
}: {
  task: DemoTask;
  selected: boolean;
  draggable?: boolean;
  onSelect(): void;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    disabled: !draggable,
    data: { type: 'task', task, status: task.status },
    attributes: { roleDescription: 'sürüklenebilir görev' },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={task.title}
      aria-pressed={selected}
      data-demo-task-id={task.id}
      data-dragging={isDragging || undefined}
      onClick={onSelect}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        'flex w-full min-w-0 flex-col gap-3 rounded-md border border-landing-border bg-landing-card p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary',
        selected && 'border-landing-primary bg-landing-primary-soft',
        isDragging && 'z-10 opacity-70 shadow-lg',
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

function DemoColumn({
  status,
  tasks,
  selectedTaskId,
  onSelectTask,
}: {
  status: DemoStatus;
  tasks: DemoTask[];
  selectedTaskId: string | null;
  onSelectTask(taskId: string): void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: columnId(status),
    data: { type: 'status', status },
  });

  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-label={`${statusLabel[status]} görevleri`}
      className={cn('landing-demo-column', isOver && 'is-drop-target')}
    >
      <header>
        <h3>{statusLabel[status]}</h3>
        <span aria-label={`${tasks.length} görev`}>{tasks.length}</span>
      </header>
      {isOver ? <span className="landing-demo-drop-hint">Buraya bırak</span> : null}
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskButton
            key={task.id}
            task={task}
            selected={selectedTaskId === task.id}
            onSelect={() => onSelectTask(task.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function LandingProductDemo({ guidedBeat, onManualInteraction }: LandingProductDemoProps) {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialDemoState);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: demoKeyboardCoordinates }),
  );
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
  const announcements: Announcements = {
    onDragStart({ active }) {
      const task = active.data.current?.task as DemoTask | undefined;
      return task ? `${task.title} sürükleniyor.` : 'Görev sürükleniyor.';
    },
    onDragOver({ active, over }) {
      const task = active.data.current?.task as DemoTask | undefined;
      const status = over?.data.current?.status;
      return task && isDemoStatus(status)
        ? `${task.title} ${statusLabel[status]} sütununun üzerinde.`
        : 'Geçerli bir sütun seçin.';
    },
    onDragEnd({ active, over }) {
      const task = active.data.current?.task as DemoTask | undefined;
      const status = over?.data.current?.status;
      return task && isDemoStatus(status)
        ? `${task.title} ${statusLabel[status]} durumuna taşındı.`
        : 'Görev taşınmadı.';
    },
    onDragCancel({ active }) {
      const task = active.data.current?.task as DemoTask | undefined;
      return task ? `${task.title} taşıma işlemi iptal edildi.` : 'Taşıma işlemi iptal edildi.';
    },
  };

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

  function handleDragStart(_event: DragStartEvent) {
    onManualInteraction();
  }

  function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const status = event.over?.data.current?.status;

    if (isDemoStatus(status)) {
      dispatch({ type: 'move-task', taskId, status });
    }

    window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-demo-task-id="${taskId}"]`)
        ?.focus({ preventScroll: true });
    });
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
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
                {statuses.map((status) => (
                  <DemoColumn
                    key={status}
                    status={status}
                    tasks={teamTasks.filter((task) => task.status === status)}
                    selectedTaskId={state.selectedTaskId}
                    onSelectTask={(taskId) => dispatchManual({ type: 'select-task', taskId })}
                  />
                ))}
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
                        draggable={false}
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
      </DndContext>
    </div>
  );
}
