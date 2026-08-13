import { useEffect, useMemo } from 'react';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { useTasks } from '@/hooks/tasks';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { useTeamStore } from '@/stores/teamStore';
import { FilterBar } from '@/components/tasks/FilterBar';
import { TaskCardRow } from '@/components/tasks/TaskCardRow';
import { TaskPagination } from '@/components/tasks/TaskPagination';
import { addCalendarDays, addCalendarMonths, utcTodayCalendarDate } from '@/lib/calendarDate';

function buildDeadlineRange(filters: ReturnType<typeof useTaskFilters>['filters']) {
  const today = utcTodayCalendarDate();
  if (filters.deadline === 'overdue') {
    return { from: undefined as string | undefined, to: addCalendarDays(today, -1) };
  }
  if (filters.deadline === 'today') {
    return { from: today, to: today };
  }
  if (filters.deadline === 'week') {
    return { from: today, to: addCalendarDays(today, 7) };
  }
  if (filters.deadline === 'month') {
    return { from: today, to: addCalendarMonths(today, 1) };
  }
  return {
    from: (filters.deadlineFrom ?? undefined) as string | undefined,
    to: (filters.deadlineTo ?? undefined) as string | undefined,
  };
}

export function TasksPage() {
  const { data: teams } = useTeams();
  const { filters, setPage } = useTaskFilters();
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
      limit: 20,
      offset: (filters.page - 1) * 20,
    };
  }, [filters]);

  const { data, isLoading } = useTasks(queryArgs);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  useEffect(() => {
    if (data && filters.page > totalPages) setPage(totalPages);
  }, [data, filters.page, setPage, totalPages]);

  return (
    <div data-testid="tasks-page" className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Görevlerim</h1>

      <FilterBar teams={teams ?? []} assignees={assignees} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : !data || data.total === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Filtrelere uyan görev yok.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {data.tasks.map((t) => (
            <TaskCardRow key={t.id} task={t} />
          ))}
          {data.total > 0 && (
            <TaskPagination page={filters.page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      )}
    </div>
  );
}
