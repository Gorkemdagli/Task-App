import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { useTasks, useUpdateTaskStatus, type Task, type TaskStatus } from '@/hooks/tasks';
import { useAuthStore } from '@/stores/authStore';
import { canUpdateTaskStatus, isCompanyAdmin } from '@/lib/permissions';
import { TaskCard } from '@/components/tasks/TaskCard';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'Yapılacak', color: 'border-status-todo' },
  { status: 'in_progress', label: 'Yapılıyor', color: 'border-status-inprogress' },
  { status: 'done', label: 'Yapıldı', color: 'border-status-done' },
];

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: teams } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const teamId = selectedTeamId ?? teams?.[0]?.id ?? null;
  const selectedTeam = teams?.find((t) => t.id === teamId);
  const { data: teamDetail } = useTeam(teamId ?? undefined);
  const teamMembers = teamDetail?.members ?? [];

  const { data: tasksData, isLoading } = useTasks(teamId ? { teamId } : undefined);
  const tasks = tasksData?.tasks ?? [];

  const updateStatus = useUpdateTaskStatus(activeTask?.id ?? '');

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) {
      if (!t.archivedAt) map[t.status].push(t);
    }
    return map;
  }, [tasks]);

  // Şirket admin her zaman admin; diğerleri için user.role === 'teamAdmin' kabul ediyoruz
  // (per-task team üyeliği kontrolü backend'de; burada sadece UI gating).
  const isTeamAdminOfThisTeam = isCompanyAdmin(user) || user?.role === 'teamAdmin';

  const canCreate = isCompanyAdmin(user) || isTeamAdminOfThisTeam;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    if (!task || task.status === newStatus) return;
    if (!canUpdateTaskStatus(user, task, isTeamAdminOfThisTeam)) return;
    updateStatus.mutate({ status: newStatus });
  };

  return (
    <div data-testid="dashboard-page" className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{selectedTeam?.name ?? 'Kanban'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tasks.length} görev</p>
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

      {teams && teams.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTeamId(t.id)}
              data-testid={`team-tab-${t.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                t.id === teamId
                  ? 'border-primary bg-primary text-black'
                  : 'border-border bg-secondary text-secondary-foreground hover:border-primary/50'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              id={col.status}
              data-testid={`column-${col.status}`}
              data-status={col.status}
              className={`rounded-md border-t-4 bg-card/30 p-4 ${col.color}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">{col.label}</h2>
                <span className="text-xs text-muted-foreground">{grouped[col.status].length}</span>
              </div>
              <div className="space-y-3 min-h-[200px]">
                {isLoading ? (
                  <p className="text-xs text-muted-foreground">Yükleniyor…</p>
                ) : grouped[col.status].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Boş</p>
                ) : (
                  grouped[col.status].map((t) => <TaskCard key={t.id} task={t} draggable />)
                )}
              </div>
            </div>
          ))}
        </div>
        <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
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
          defaultAssigneeId={user?.id}
        />
      )}
    </div>
  );
}
