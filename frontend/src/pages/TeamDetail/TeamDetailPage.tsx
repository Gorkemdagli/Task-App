import { useEffect, useState } from 'react';
import { ChevronLeft, Flag, ListChecks, Plus, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTeam } from '@/hooks/queries/useTeams';
import { useTasks, type Task, type TaskPriority } from '@/hooks/tasks';
import { useAuth } from '@/hooks/useAuth';
import { useTeamStore } from '@/stores/teamStore';
import { Button } from '@/components/ui/button';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';
import { TaskPagination } from '@/components/tasks/TaskPagination';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCalendarDateDisplay, utcTodayCalendarDate } from '@/lib/calendarDate';
import { MemberList } from './MemberList';
import { AddMemberModal } from './AddMemberModal';
import { TeamEditModal } from './TeamEditModal';
import { TeamDashboard } from './TeamDashboard';

const PAGE_SIZE = 8;

const TASK_STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

const TASK_STATUS_CLASS: Record<Task['status'], string> = {
  todo: 'bg-secondary text-secondary-foreground',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-status-done/15 text-status-done',
};

const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const TASK_PRIORITY_CLASS: Record<TaskPriority, string> = {
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
};

function TaskStatusBadge({ status }: { status: Task['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs',
        TASK_STATUS_CLASS[status],
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'todo' && 'bg-status-todo',
          status === 'in_progress' && 'bg-status-inprogress',
          status === 'done' && 'bg-status-done',
        )}
      />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

function TeamTaskRow({ task }: { task: Task }) {
  const overdue =
    task.deadline !== null && task.deadline < utcTodayCalendarDate() && task.status !== 'done';

  return (
    <Link
      to={`/tasks/${task.id}`}
      data-testid={`team-task-row-${task.id}`}
      className="grid gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
    >
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{task.title}</span>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium',
          TASK_PRIORITY_CLASS[task.priority],
        )}
      >
        <Flag className="h-3.5 w-3.5 fill-current" aria-hidden />
        {TASK_PRIORITY_LABEL[task.priority]}
      </span>
      <TaskStatusBadge status={task.status} />
      <span
        className={cn(
          'text-xs text-secondary-foreground',
          overdue && 'font-medium text-priority-high',
        )}
      >
        {formatCalendarDateDisplay(task.deadline)}
      </span>
    </Link>
  );
}

function TeamDetailLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[28rem] w-full rounded-lg" />
        <Skeleton className="h-[28rem] w-full rounded-lg" />
      </div>
    </section>
  );
}

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: team, isLoading, isError } = useTeam(id);
  const { user, isCompanyAdmin } = useAuth();
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const navigate = useNavigate();
  const [pagination, setPagination] = useState({
    teamId: id,
    taskPage: 1,
    memberPage: 1,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const currentPagination =
    pagination.teamId === id ? pagination : { teamId: id, taskPage: 1, memberPage: 1 };
  const taskPageHint = Math.max(1, Math.ceil((team?.taskCount ?? 0) / PAGE_SIZE));
  const taskPage = Math.min(currentPagination.taskPage, taskPageHint);
  const memberPage = currentPagination.memberPage;
  const { data: tasksData, isLoading: tasksLoading, isError: tasksError } = useTasks(
    id
      ? {
          teamId: id,
          includeArchived: false,
          limit: PAGE_SIZE,
          offset: (taskPage - 1) * PAGE_SIZE,
        }
      : undefined,
  );
  const allTasks = tasksData?.tasks ?? [];
  const tasks = allTasks.slice(0, PAGE_SIZE);
  const taskTotal = tasksData?.total ?? team?.taskCount ?? 0;
  const [activeTab, setActiveTab] = useState<'detail' | 'dashboard'>('detail');

  const viewerMembership = team?.members.find((member) => member.userId === user?.id);
  const isTeamAdminOfThisTeam = viewerMembership?.role === 'teamAdmin';
  const canManageMembers = isCompanyAdmin || isTeamAdminOfThisTeam;
  const canManageRoles = isCompanyAdmin;
  const canCreateTask = canManageMembers;
  const memberTotal = team?.memberCount ?? team?.members.length ?? 0;
  const taskTotalPages = Math.max(1, Math.ceil(taskTotal / PAGE_SIZE));
  const memberTotalPages = Math.max(1, Math.ceil(memberTotal / PAGE_SIZE));

  const visibleTaskPage = Math.min(taskPage, taskTotalPages);
  const visibleMemberPage = Math.min(memberPage, memberTotalPages);
  const visibleMembers = team
    ? team.members.slice((visibleMemberPage - 1) * PAGE_SIZE, visibleMemberPage * PAGE_SIZE)
    : [];
  const changeTaskPage = (page: number) => {
    setPagination((current) =>
      current.teamId === id
        ? { ...current, taskPage: page }
        : { teamId: id, taskPage: page, memberPage: 1 },
    );
  };
  const changeMemberPage = (page: number) => {
    setPagination((current) =>
      current.teamId === id
        ? { ...current, memberPage: page }
        : { teamId: id, taskPage: 1, memberPage: page },
    );
  };

  useEffect(() => {
    if (id) setActiveTeamId(id);
  }, [id, setActiveTeamId]);

  const visibleTab = canManageMembers && activeTab === 'dashboard' ? 'dashboard' : 'detail';

  if (isLoading) return <TeamDetailLoading />;

  if (isError || !team) {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Takım bulunamadı</h1>
        <p className="text-sm text-secondary-foreground">
          Bu takıma erişim yetkin yok ya da takım mevcut değil.
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
          Takımlara dön
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate('/teams')} className="-ml-2">
        <ChevronLeft className="h-4 w-4" />
        Takımlara Geri Dön
      </Button>

      <header className="rounded-lg border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary text-black">
              <Users className="h-8 w-8" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-foreground">{team.name}</h1>
              <p className="mt-1 max-w-2xl text-sm text-secondary-foreground">
                {team.description || 'Bu takım için henüz bir açıklama eklenmedi.'}
              </p>
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-secondary-foreground" aria-hidden />
                  <dt className="text-xs text-secondary-foreground">Üye</dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">
                    {team.memberCount}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-secondary-foreground" aria-hidden />
                  <dt className="text-xs text-secondary-foreground">Aktif görev</dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">
                    {team.taskCount}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          {canManageMembers && (
            <div className="shrink-0 lg:pl-6">
              <TeamEditModal
                key={`${team.id}:${team.name}:${team.description ?? ''}`}
                teamId={team.id}
                name={team.name}
                description={team.description}
              />
              <p className="mt-2 max-w-xs text-xs text-secondary-foreground">
                Takım bilgilerini yalnızca takım yöneticileri güncelleyebilir.
              </p>
            </div>
          )}
        </div>
      </header>

      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Takım görünümü"
      >
        <button
          type="button"
          role="tab"
          aria-selected={visibleTab === 'detail'}
          className={cn(
            'border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            visibleTab === 'detail'
              ? 'border-primary text-foreground'
              : 'border-transparent text-secondary-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('detail')}
        >
          Takım Detayı
        </button>
        {canManageMembers && (
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === 'dashboard'}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              visibleTab === 'dashboard'
                ? 'border-primary text-foreground'
                : 'border-transparent text-secondary-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
        )}
      </div>

      {visibleTab === 'dashboard' ? (
        <TeamDashboard teamId={team.id} enabled={canManageMembers} />
      ) : (
        <div data-testid="team-detail-panels" className="grid items-stretch gap-4 lg:grid-cols-2">
          <section className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <h2 className="text-lg font-semibold text-foreground">
                Üyeler <span className="text-secondary-foreground">({team.memberCount})</span>
              </h2>
              {canManageMembers && <AddMemberModal teamId={team.id} />}
            </div>
            <div className="min-h-0 flex-1 p-3">
              <MemberList
                members={visibleMembers}
                teamId={team.id}
                canManageMembers={canManageMembers}
                canManageRoles={canManageRoles}
                compact
              />
            </div>
            <TaskPagination
              page={visibleMemberPage}
              totalPages={memberTotalPages}
              total={memberTotal}
              pageSize={PAGE_SIZE}
              itemLabel="üye"
              ariaLabel="Üye sayfaları"
              onPageChange={changeMemberPage}
            />
          </section>

          <section className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <h2 className="text-lg font-semibold text-foreground">
                Görevler <span className="text-secondary-foreground">({team.taskCount})</span>
              </h2>
              {canCreateTask && (
                <Button
                  type="button"
                  size="sm"
                  data-testid="team-add-task-button"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Yeni Görev
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              {tasksLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-12 w-full rounded-md" />
                  <Skeleton className="h-12 w-full rounded-md" />
                </div>
              ) : tasksError ? (
                <p role="alert" className="p-6 text-sm text-destructive">
                  Takım görevleri yüklenemedi.
                </p>
              ) : tasks.length === 0 ? (
                <p className="p-6 text-center text-sm text-secondary-foreground">
                  Bu takımda aktif görev yok.
                </p>
              ) : (
                <div data-testid="team-tasks-list" className="overflow-hidden">
                  <div
                    data-testid="team-task-list-header"
                    className="hidden border-b border-border bg-secondary/30 px-4 py-2 text-xs font-medium text-secondary-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-3"
                  >
                    <span>Görev Adı</span>
                    <span>Öncelik</span>
                    <span>Durum</span>
                    <span>Son Tarih</span>
                  </div>
                  {tasks.map((task) => (
                    <TeamTaskRow key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
            <TaskPagination
              page={visibleTaskPage}
              totalPages={taskTotalPages}
              total={taskTotal}
              pageSize={PAGE_SIZE}
              onPageChange={changeTaskPage}
            />
          </section>
        </div>
      )}

      {visibleTab === 'detail' && canCreateTask && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          teamId={team.id}
          members={team.members.map((member) => ({
            id: member.userId,
            fullName: member.fullName,
            avatarUrl: member.avatarUrl,
          }))}
        />
      )}
    </section>
  );
}
