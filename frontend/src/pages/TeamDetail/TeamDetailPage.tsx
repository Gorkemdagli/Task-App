import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, Flag, ListChecks, Pencil, Plus, Save, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { TeamDashboard } from './TeamDashboard';
import { useUpdateTeam, useUploadTeamPhoto } from '@/hooks/queries/useTeamMutations';
import { getApiErrorMessage } from '@/lib/apiError';

const PAGE_SIZE = 8;

function teamInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

const TASK_STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'teams.detail.todo',
  in_progress: 'teams.detail.inProgress',
  done: 'teams.detail.done',
};

const TASK_STATUS_CLASS: Record<Task['status'], string> = {
  todo: 'bg-secondary text-secondary-foreground',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-status-done/15 text-status-done',
};

const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'teams.detail.high',
  medium: 'teams.detail.medium',
  low: 'teams.detail.low',
};

const TASK_PRIORITY_CLASS: Record<TaskPriority, string> = {
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
};

function TaskStatusBadge({ status }: { status: Task['status'] }) {
  const { t } = useTranslation();
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
      {t(TASK_STATUS_LABEL[status])}
    </span>
  );
}

function TeamTaskRow({ task }: { task: Task }) {
  const { t, i18n } = useTranslation();
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
        {t(TASK_PRIORITY_LABEL[task.priority])}
      </span>
      <TaskStatusBadge status={task.status} />
      <span
        className={cn(
          'text-xs text-secondary-foreground',
          overdue && 'font-medium text-priority-high',
        )}
      >
        {formatCalendarDateDisplay(task.deadline, i18n.language)}
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
  const { t } = useTranslation();
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
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{ teamId: string; name: string; description: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const updateTeam = useUpdateTeam();
  const uploadTeamPhoto = useUploadTeamPhoto(id ?? '');

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

  const startEdit = () => {
    setEditDraft({ teamId: team!.id, name: team!.name, description: team!.description ?? '' });
    setEditError(null);
    setPhotoError(null);
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setIsEditing(false);
    setEditDraft(null);
    setEditError(null);
    setPhotoError(null);
  };
  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!team || editDraft?.teamId !== team.id) return;
    const name = editDraft.name.trim();
    if (name.length < 2) {
      setEditError(t('teams.edit.invalidName'));
      return;
    }
    setEditError(null);
    try {
      await updateTeam.mutateAsync({
        teamId: team.id,
        name,
        description: editDraft.description.trim() || null,
      });
      cancelEdit();
    } catch (error) {
      setEditError(getApiErrorMessage(error, t('teams.edit.detailsError')));
    }
  };
  const changeTeamPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !team) return;
    setPhotoError(null);
    try {
      await uploadTeamPhoto.mutateAsync(file);
    } catch (error) {
      setPhotoError(getApiErrorMessage(error, t('teams.edit.photoError')));
    }
  };

  if (isLoading) return <TeamDetailLoading />;

  if (isError || !team) {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('teams.detail.notFound')}</h1>
        <p className="text-sm text-secondary-foreground">
          {t('teams.detail.unavailable')}
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
          {t('teams.detail.back')}
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate('/teams')} className="-ml-2">
        <ChevronLeft className="h-4 w-4" />
        {t('teams.detail.backTitle')}
      </Button>

      <header className="rounded-lg border border-border bg-card p-5 md:p-6">
        <form onSubmit={saveEdit} className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-lg font-semibold text-black">
              {team.photoUrl ? (
                <img src={team.photoUrl} alt={team.name} className="h-full w-full object-cover" />
              ) : (
                <span aria-label={team.name} role="img">{teamInitials(team.name)}</span>
              )}
              {canManageMembers && isEditing && (
                <>
                  <input
                    ref={photoInputRef}
                    id="team-photo-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={changeTeamPhoto}
                  />
                  <button
                    type="button"
                    aria-label={t('teams.edit.changePhoto')}
                    title={t('teams.edit.changePhoto')}
                    disabled={uploadTeamPhoto.isPending}
                    onClick={() => photoInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-100"
                  >
                    <Camera className="h-5 w-5" aria-hidden />
                  </button>
                </>
              )}
            </div>
            <div className="min-w-0">
              {isEditing && editDraft?.teamId === team.id ? (
                <>
                  <label htmlFor="team-edit-name" className="sr-only">{t('teams.edit.name')}</label>
                  <input
                    id="team-edit-name"
                    value={editDraft.name}
                    onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                    maxLength={60}
                    aria-required="true"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xl font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <label htmlFor="team-edit-description" className="sr-only">{t('teams.edit.teamDescription')}</label>
                  <textarea
                    id="team-edit-description"
                    value={editDraft.description}
                    onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                    maxLength={300}
                    rows={2}
                    className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </>
              ) : (
                <>
                  <h1 className="truncate text-2xl font-semibold text-foreground">{team.name}</h1>
                  <p className="mt-1 max-w-2xl text-sm text-secondary-foreground">
                    {team.description || t('teams.detail.emptyDescription')}
                  </p>
                </>
              )}
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-secondary-foreground" aria-hidden />
                  <dt className="text-xs text-secondary-foreground">{t('teams.detail.member')}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">
                    {team.memberCount}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-secondary-foreground" aria-hidden />
                  <dt className="text-xs text-secondary-foreground">{t('teams.detail.activeTask')}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">
                    {team.taskCount}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          {canManageMembers && (
            <div className="shrink-0 lg:pl-6">
              {editError && <p role="alert" className="mb-2 max-w-xs text-sm text-destructive">{editError}</p>}
              {photoError && <p role="alert" className="mb-2 max-w-xs text-sm text-destructive">{photoError}</p>}
              {isEditing ? (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={updateTeam.isPending}>
                    <X className="h-4 w-4" aria-hidden />
                    {t('tasks.common.discard')}
                  </Button>
                  <Button type="submit" size="sm" loading={updateTeam.isPending}>
                    <Save className="h-4 w-4" aria-hidden />
                    {t('teams.edit.save')}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={startEdit}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  {t('teams.edit.button')}
                </Button>
              )}
              <p className="mt-2 max-w-xs text-xs text-secondary-foreground">
                {t('teams.detail.managerHint')}
              </p>
            </div>
          )}
        </form>
      </header>

      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label={t('teams.detail.view')}
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
          {t('teams.detail.detailTab')}
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
            {t('teams.detail.dashboardTab')}
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
                {t('teams.detail.members')} <span className="text-secondary-foreground">({team.memberCount})</span>
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
              itemLabel={t('teams.detail.memberItem')}
              ariaLabel={t('teams.detail.memberPagination')}
              onPageChange={changeMemberPage}
            />
          </section>

          <section className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <h2 className="text-lg font-semibold text-foreground">
                {t('teams.detail.tasks')} <span className="text-secondary-foreground">({team.taskCount})</span>
              </h2>
              {canCreateTask && (
                <Button
                  type="button"
                  size="sm"
                  data-testid="team-add-task-button"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t('teams.detail.newTask')}
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
                  {t('teams.detail.tasksError')}
                </p>
              ) : tasks.length === 0 ? (
                <p className="p-6 text-center text-sm text-secondary-foreground">
                  {t('teams.detail.noActiveTasks')}
                </p>
              ) : (
                <div data-testid="team-tasks-list" className="overflow-hidden">
                  <div
                    data-testid="team-task-list-header"
                    className="hidden border-b border-border bg-secondary/30 px-4 py-2 text-xs font-medium text-secondary-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-3"
                  >
                    <span>{t('teams.detail.taskName')}</span>
                    <span>{t('teams.detail.priority')}</span>
                    <span>{t('teams.detail.status')}</span>
                    <span>{t('teams.detail.dueDate')}</span>
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
              itemLabel={t('teams.detail.taskItem')}
              ariaLabel={t('teams.detail.taskPagination')}
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
