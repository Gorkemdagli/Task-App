import { useEffect, useMemo } from 'react';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { useTasks } from '@/hooks/tasks';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { useAuth } from '@/hooks/useAuth';
import { useTeamStore } from '@/stores/teamStore';
import { ActiveFilterChips, FilterBar } from '@/components/tasks/FilterBar';
import { TaskCardRow, TaskListHeader } from '@/components/tasks/TaskCardRow';
import { TaskPagination } from '@/components/tasks/TaskPagination';
import { addCalendarDays, addCalendarMonths, utcTodayCalendarDate } from '@/lib/calendarDate';

const TASK_PAGE_SIZE = 15;

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
  const { user } = useAuth();
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
      limit: TASK_PAGE_SIZE,
      offset: (filters.page - 1) * TASK_PAGE_SIZE,
    };
  }, [filters]);

  const { data, isLoading } = useTasks(queryArgs);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / TASK_PAGE_SIZE));

  useEffect(() => {
    if (data && filters.page > totalPages) setPage(totalPages);
  }, [data, filters.page, setPage, totalPages]);

  return (
    <div
      data-testid="tasks-page"
      className="mx-auto w-full max-w-6xl space-y-6 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden"
    >
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Görevlerim</h1>
      </header>

      <div className="flex min-h-0 flex-col items-stretch gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-start lg:gap-6">
        <FilterBar teams={teams ?? []} assignees={assignees} currentUserId={user?.id} />

        <section
          className="min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto"
          aria-label="Görev sonuçları"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-secondary-foreground">
              {isLoading ? 'Yükleniyor…' : `${data?.total ?? 0} görev bulundu`}
            </p>
            <ActiveFilterChips teams={teams ?? []} assignees={assignees} currentUserId={user?.id} />
          </div>

          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-md bg-secondary" />
              ))}
            </div>
          ) : !data || data.total === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              Filtrelere uyan görev yok.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <TaskListHeader />
              {data.tasks.map((task) => (
                <TaskCardRow key={task.id} task={task} />
              ))}
              <TaskPagination
                page={filters.page}
                totalPages={totalPages}
                total={data.total}
                onPageChange={setPage}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
