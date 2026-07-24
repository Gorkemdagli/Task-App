import { useMemo } from 'react';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { useTasks } from '@/hooks/tasks';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { useTeamStore } from '@/stores/teamStore';
import { FilterBar } from '@/components/tasks/FilterBar';
import { TaskCardRow } from '@/components/tasks/TaskCardRow';

function buildDeadlineRange(filters: ReturnType<typeof useTaskFilters>['filters']) {
  const now = new Date();
  if (filters.deadline === 'overdue') {
    return { from: undefined as string | undefined, to: now.toISOString() };
  }
  if (filters.deadline === 'today') {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (filters.deadline === 'week') {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { from: now.toISOString(), to: end.toISOString() };
  }
  if (filters.deadline === 'month') {
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    return { from: now.toISOString(), to: end.toISOString() };
  }
  return {
    from: (filters.deadlineFrom ?? undefined) as string | undefined,
    to: (filters.deadlineTo ?? undefined) as string | undefined,
  };
}

export function TasksPage() {
  const { data: teams } = useTeams();
  const { filters } = useTaskFilters();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const membersTeamId = filters.teamId ?? activeTeamId ?? undefined;
  const { data: membersTeam } = useTeam(membersTeamId);

  const assignees = useMemo(
    () =>
      (membersTeam?.members ?? []).map((m) => ({
        id: m.userId,
        fullName: m.fullName,
      })),
    [membersTeam],
  );

  const queryArgs = useMemo(() => {
    const { from, to } = buildDeadlineRange(filters);
    return {
      status: filters.status.length ? filters.status : undefined,
      priority: filters.priority.length ? filters.priority : undefined,
      teamId: filters.teamId ?? undefined,
      assigneeIds: filters.assigneeIds.length ? filters.assigneeIds : undefined,
      deadlineFrom: from,
      deadlineTo: to,
      includeArchived: filters.includeArchived,
      limit: 100,
    };
  }, [filters]);

  const { data, isLoading } = useTasks(queryArgs);

  return (
    <div data-testid="tasks-page" className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Görevlerim</h1>

      <FilterBar teams={teams ?? []} assignees={assignees} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : !data || data.tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Filtrelere uyan görev yok.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {data.tasks.map((t) => (
            <TaskCardRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
