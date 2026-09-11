import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import {
  useTasks,
  useTask,
  useTaskComments,
  useUpdateTaskStatus,
  useProposeTaskStatus,
  type Task,
  type TaskStatus,
} from '@/hooks/tasks';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { canCommentOnTask, canUpdateTaskStatus, isCompanyAdmin } from '@/lib/permissions';
import { getDisplayStatus } from '@/lib/taskDisplay';
import { formatCalendarDateDisplay, utcTodayCalendarDate } from '@/lib/calendarDate';
import { TaskCard } from '@/components/tasks/TaskCard';
import { CommentInput } from '@/components/comments/CommentInput';
import { CommentList } from '@/components/comments/CommentList';
import { PendingStatusBadge } from '@/components/tasks/PendingStatusBadge';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';
import { ProposeConfirmDialog } from '@/components/tasks/ProposeConfirmDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { MAX_RENDERED_RECORDS, RECORD_CAP_MESSAGE } from '@/lib/listLimits';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'Yapılacak', color: 'border-status-todo' },
  { status: 'in_progress', label: 'Yapılıyor', color: 'border-status-inprogress' },
  { status: 'done', label: 'Yapıldı', color: 'border-status-done' },
];

const EMPTY_TASKS: Task[] = [];

type WorkflowFilter = 'overdue' | 'today' | 'pending' | 'upcoming' | 'archived';

const WORKFLOW_ITEMS: Array<{
  id: WorkflowFilter;
  label: string;
  dotClass: string;
}> = [
  { id: 'overdue', label: 'Geciken', dotClass: 'bg-priority-high' },
  { id: 'today', label: 'Bugün', dotClass: 'bg-primary' },
  { id: 'pending', label: 'Onay Bekliyor', dotClass: 'bg-status-todo' },
  { id: 'upcoming', label: 'Yaklaşan', dotClass: 'bg-status-todo' },
  { id: 'archived', label: 'Arşiv', dotClass: 'bg-secondary-foreground' },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  todo: 'border-status-todo/40 bg-status-todo/10 text-status-todo',
  in_progress: 'border-status-inprogress/40 bg-status-inprogress/10 text-status-inprogress',
  done: 'border-status-done/40 bg-status-done/10 text-status-done',
};

const PRIORITY_BADGE_CLASS: Record<Task['priority'], string> = {
  high: 'border-priority-high/40 bg-priority-high/10 text-priority-high',
  medium: 'border-priority-medium/40 bg-priority-medium/10 text-priority-medium',
  low: 'border-priority-low/40 bg-priority-low/10 text-priority-low',
};

function matchesWorkflowFilter(
  task: Task,
  filter: WorkflowFilter,
  currentUserId: string | undefined,
): boolean {
  const today = utcTodayCalendarDate();
  const displayStatus = getDisplayStatus(task, currentUserId);

  if (filter === 'archived') return task.archivedAt !== null;
  if (task.archivedAt !== null) return false;
  if (filter === 'pending') return task.pendingStatus !== null;
  if (!task.deadline) return false;
  if (filter === 'overdue') return task.deadline < today && displayStatus !== 'done';
  if (filter === 'today') return task.deadline === today;
  return task.deadline > today;
}

function WorkflowStrip({
  tasks,
  activeFilter,
  onSelect,
  currentUserId,
}: {
  tasks: Task[];
  activeFilter: WorkflowFilter | null;
  onSelect: (filter: WorkflowFilter) => void;
  currentUserId?: string;
}) {
  return (
    <div
      data-testid="workflow-strip"
      className="mb-6 grid rounded-md border border-border bg-muted/40 md:flex md:overflow-hidden"
    >
      <div className="flex min-w-0 flex-col justify-center border-b border-border px-4 py-3 md:min-w-[8rem] md:border-b-0 md:border-r">
        <span className="text-sm font-semibold text-foreground">İş Akışı</span>
      </div>
      {WORKFLOW_ITEMS.map((item) => {
        const count = tasks.filter((task) =>
          matchesWorkflowFilter(task, item.id, currentUserId),
        ).length;
        const active = activeFilter === item.id;

        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            data-testid={`workflow-filter-${item.id}`}
            onClick={() => onSelect(item.id)}
            className={`flex w-full flex-1 items-center justify-between gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary md:min-w-[10rem] md:border-b-0 md:border-r md:last:border-r-0 ${
              active ? 'bg-primary/10 text-primary' : 'text-foreground'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dotClass}`} />
              <span className="truncate text-sm font-medium">{item.label}</span>
            </span>
            <span
              data-testid={`workflow-count-${item.id}`}
              className="text-xs text-muted-foreground tabular-nums"
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusColumn({
  column,
  tasks,
  isLoading,
  userId,
  showTeam,
  selectedTaskId,
  onSelectTask,
  draggable = true,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  isLoading: boolean;
  userId?: string;
  showTeam?: boolean;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  draggable?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const taskListRef = useRef<HTMLDivElement>(null);

  const scrollTasks = (direction: -1 | 1) => {
    const taskList = taskListRef.current;
    if (!taskList) return;
    taskList.scrollBy({ left: direction * taskList.clientWidth, behavior: 'smooth' });
  };

  return (
    <div
      ref={setNodeRef}
      id={column.status}
      data-testid={`column-${column.status}`}
      data-status={column.status}
      className={`min-w-0 rounded-md border-t-4 bg-card/30 p-4 ${column.color} ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">{column.label}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="min-h-[200px]">
        {isLoading ? (
          <div className="space-y-3" aria-label="Görevler yükleniyor">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Boş</p>
        ) : (
          <div>
            <div
              ref={taskListRef}
              id={`task-carousel-${column.status}`}
              data-testid={`task-carousel-${column.status}`}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:block md:space-y-3 md:overflow-visible md:pb-0"
            >
              {tasks.map((task) => (
                <div key={task.id} className="min-w-full snap-start md:min-w-0">
                  <TaskCard
                    task={task}
                    draggable={draggable}
                    currentUserId={userId}
                    showTeam={showTeam}
                    selected={selectedTaskId === task.id}
                    onSelect={onSelectTask ? () => onSelectTask(task.id) : undefined}
                  />
                </div>
              ))}
            </div>
            {tasks.length > 1 && (
              <div className="mt-3 flex items-center justify-between md:hidden">
                <button
                  type="button"
                  aria-label={`${column.label} önceki görev`}
                  onClick={() => scrollTasks(-1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card/90 text-secondary-foreground shadow-card transition-colors hover:bg-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${column.label} sonraki görev`}
                  onClick={() => scrollTasks(1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card/90 text-secondary-foreground shadow-card transition-colors hover:bg-secondary"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberTaskDetailPanel({
  task,
  comments,
  commentsLoading,
  onClose,
  user,
}: {
  task: Task;
  comments: NonNullable<ReturnType<typeof useTaskComments>['data']>['comments'];
  commentsLoading: boolean;
  onClose: () => void;
  user: AuthUser | null;
}) {
  return (
    <>
      <aside
        data-testid="member-task-detail-panel"
        role="dialog"
        aria-label="Görev ayrıntısı"
        className="hidden overflow-y-auto border-l border-border bg-card text-card-foreground shadow-modal lg:fixed lg:bottom-0 lg:right-0 lg:top-14 lg:block lg:w-[min(38vw,32rem)] lg:shadow-none"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Görev ayrıntısı</span>
            <Link
              to={`/tasks/${task.id}`}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Göreve git
            </Link>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Görev ayrıntısını kapat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-sm border px-2 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[task.status]}`}
            >
              {STATUS_LABEL[task.status]}
            </span>
            <span
              className={`rounded-sm border px-2 py-1 text-xs font-medium ${PRIORITY_BADGE_CLASS[task.priority]}`}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
            {task.pendingStatus && task.pendingProposer?.id !== user?.id && (
              <PendingStatusBadge status={task.pendingStatus} />
            )}
          </div>

          <h2 className="text-xl font-semibold leading-tight">
            <Link to={`/tasks/${task.id}`} className="transition-colors hover:text-primary">
              {task.title}
            </Link>
          </h2>

          <dl className="grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="mb-1 text-xs text-muted-foreground">Son tarih</dt>
              <dd className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {formatCalendarDateDisplay(task.deadline)}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs text-muted-foreground">Sorumlu</dt>
              <dd>{task.assignees.map((assignee) => assignee.user.fullName).join(', ') || '—'}</dd>
            </div>
          </dl>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Açıklama</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {task.description || 'Açıklama eklenmemiş.'}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Yorumlar ({comments.length})</h3>
            {commentsLoading ? (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            ) : (
              <CommentList comments={comments} />
            )}
            {canCommentOnTask(user, task, true) && <CommentInput taskId={task.id} />}
          </section>
        </div>
      </aside>
    </>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { data: teams } = useTeams();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dashboardTeamId, setDashboardTeamId] = useState<string | null>(() =>
    isCompanyAdmin(user) ? null : activeTeamId,
  );
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [proposeIntent, setProposeIntent] = useState<{
    taskId: string;
    newStatus: TaskStatus;
  } | null>(null);

  const allSortedTeams = useMemo(
    () => [...(teams ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [teams],
  );
  const sortedTeams = allSortedTeams.slice(0, MAX_RENDERED_RECORDS);
  const selectedDashboardTeamId =
    dashboardTeamId && sortedTeams.some((team) => team.id === dashboardTeamId)
      ? dashboardTeamId
      : null;
  const teamId =
    selectedDashboardTeamId ??
    (isCompanyAdmin(user) && sortedTeams.length > 1 ? null : (sortedTeams[0]?.id ?? null));
  const isAllTeamScope = isCompanyAdmin(user) && dashboardTeamId === null;
  const selectedTeam = sortedTeams.find((t) => t.id === teamId);
  const { data: teamDetail } = useTeam(teamId ?? undefined);
  const teamMembers = teamDetail?.members ?? [];

  const isTeamAdminOfThisTeam =
    isCompanyAdmin(user) ||
    teamDetail?.members.some(
      (member) => member.userId === user?.id && member.role === 'teamAdmin',
    ) === true;
  const isMemberSurface = user?.role === 'member' && !isTeamAdminOfThisTeam;

  const taskFilters = isMemberSurface
    ? {
        ...(teamId ? { teamId } : {}),
        assigneeIds: user?.id ? [user.id] : [],
        limit: MAX_RENDERED_RECORDS,
      }
    : {
        ...(teamId ? { teamId } : {}),
        includeArchived: true,
        limit: MAX_RENDERED_RECORDS,
      };

  const { data: tasksData, isLoading } = useTasks(taskFilters);
  const tasks = tasksData?.tasks ?? EMPTY_TASKS;
  const activeTasks = useMemo(() => tasks.filter((task) => !task.archivedAt), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((task) => task.archivedAt), [tasks]);
  const visibleTasks = useMemo(() => {
    if (workflowFilter === 'archived') return archivedTasks;
    if (!workflowFilter) return activeTasks;
    return activeTasks.filter((task) => matchesWorkflowFilter(task, workflowFilter, user?.id));
  }, [activeTasks, archivedTasks, user?.id, workflowFilter]);

  const selectedTaskQuery = useTask(selectedTaskId ?? undefined);
  const commentsQuery = useTaskComments(selectedTaskId ?? undefined);

  const updateStatusDirect = useUpdateTaskStatus();
  const proposeStatus = useProposeTaskStatus();

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of visibleTasks) {
      map[getDisplayStatus(t, user?.id)].push(t);
    }
    return map;
  }, [user?.id, visibleTasks]);

  const canCreate = isCompanyAdmin(user) || isTeamAdminOfThisTeam;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setActiveTask(t);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const taskId = String(e.active.id);
    const newStatus = e.over?.id as TaskStatus | undefined;
    if (!newStatus || !COLUMNS.some((c) => c.status === newStatus)) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || getDisplayStatus(task, user?.id) === newStatus) return;
    if (!canUpdateTaskStatus(user, task, isTeamAdminOfThisTeam)) {
      console.warn('[Dashboard] drag ignored: user lacks permission', {
        taskId,
        userId: user?.id,
      });
      return;
    }

    // Multi-assignee → onay modalı (admin + member); tek-assignee admin → direkt; tek-assignee member → atomik propose.
    if (task.assignees.length > 1) {
      setProposeIntent({ taskId, newStatus });
    } else if (isTeamAdminOfThisTeam) {
      updateStatusDirect.mutate({ taskId, status: newStatus });
    } else {
      proposeStatus.mutate({ taskId, status: newStatus });
    }
  };

  const handleTeamSelect = (nextTeamId: string | null) => {
    setDashboardTeamId(nextTeamId);
    setActiveTeamId(nextTeamId);
    setWorkflowFilter(null);
    setSelectedTaskId(null);
  };

  const handleTaskSelect = (taskId: string) => {
    const isDesktop =
      typeof window === 'undefined' ||
      !window.matchMedia ||
      window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      setSelectedTaskId(taskId);
    } else {
      navigate(`/tasks/${taskId}`);
    }
  };

  const selectedTask = selectedTaskQuery.data ?? tasks.find((task) => task.id === selectedTaskId);
  const hasTaskDetail = Boolean(selectedTaskId && selectedTask);
  const heading =
    selectedTeam?.name ??
    (sortedTeams.length === 1
      ? sortedTeams[0].name
      : sortedTeams.length > 1
        ? 'Tüm Takımlar'
        : 'Kanban');

  return (
    <div
      data-testid="dashboard-page"
      className={`p-4 md:p-8 ${hasTaskDetail ? 'lg:pr-[min(38vw,32rem)]' : ''}`}
    >
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{visibleTasks.length} görev</p>
        </div>
        {canCreate && teamId && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            data-testid="add-task-button"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover"
          >
            + Görev Ekle
          </button>
        )}
      </div>

      {allSortedTeams.length > MAX_RENDERED_RECORDS && (
        <p className="mb-2 text-xs text-muted-foreground">{RECORD_CAP_MESSAGE}</p>
      )}
      {!isMemberSurface && (
        <WorkflowStrip
          tasks={tasks}
          activeFilter={workflowFilter}
          onSelect={(filter) =>
            setWorkflowFilter((current) => (current === filter ? null : filter))
          }
          currentUserId={user?.id}
        />
      )}
      {sortedTeams.length > 1 || isCompanyAdmin(user) ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {isCompanyAdmin(user) && sortedTeams.length > 0 && (
            <button
              type="button"
              onClick={() => handleTeamSelect(null)}
              data-testid="team-tab-all"
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                isAllTeamScope
                  ? 'border-primary bg-primary text-black'
                  : 'border-border bg-secondary text-secondary-foreground hover:border-primary/50'
              }`}
            >
              Tüm Takımlar
            </button>
          )}
          {sortedTeams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTeamSelect(t.id)}
              data-testid={`team-tab-${t.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                !isAllTeamScope && t.id === teamId
                  ? 'border-primary bg-primary text-black'
                  : 'border-border bg-secondary text-secondary-foreground hover:border-primary/50'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {COLUMNS.map((column) => (
              <StatusColumn
                key={column.status}
                column={column}
                tasks={grouped[column.status]}
                isLoading={isLoading}
                userId={user?.id}
                showTeam={isAllTeamScope}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleTaskSelect}
                draggable={workflowFilter !== 'archived'}
              />
            ))}
          </div>
          {hasTaskDetail && selectedTask && (
            <MemberTaskDetailPanel
              task={selectedTask}
              comments={commentsQuery.data?.comments ?? []}
              commentsLoading={commentsQuery.isLoading}
              onClose={() => setSelectedTaskId(null)}
              user={user}
            />
          )}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} currentUserId={user?.id} /> : null}
        </DragOverlay>
      </DndContext>

      {teamId && teamDetail && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          teamId={teamId}
          members={teamMembers.map((m) => ({
            id: m.userId,
            fullName: m.fullName,
            avatarUrl: m.avatarUrl,
          }))}
        />
      )}

      {proposeIntent &&
        (() => {
          const intentTask = tasks.find((t) => t.id === proposeIntent.taskId);
          if (!intentTask) return null;
          return (
            <ProposeConfirmDialog
              open
              task={intentTask}
              newStatus={proposeIntent.newStatus}
              isProposing={proposeStatus.isPending}
              onCancel={() => setProposeIntent(null)}
              onConfirm={() => {
                proposeStatus.mutate(
                  { taskId: proposeIntent.taskId, status: proposeIntent.newStatus },
                  { onSettled: () => setProposeIntent(null) },
                );
              }}
            />
          );
        })()}
    </div>
  );
}
