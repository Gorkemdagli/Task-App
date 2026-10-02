import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  Flag,
  Pencil,
  Save,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
  useTask,
  useTaskComments,
  useUpdateTaskStatus,
  useProposeTaskStatus,
  useAckTaskStatus,
  useCancelTaskStatus,
  useUpdateTaskPriority,
  useUpdateTaskBlocked,
  useUpdateTaskFields,
  useRestoreTask,
  useDeleteTask,
  type Task,
  type TaskStatus,
} from '@/hooks/tasks';
import { useAuthStore } from '@/stores/authStore';
import { useTeam } from '@/hooks/queries/useTeams';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  canCommentOnTask,
  canDeleteTask,
  canManageTaskInTeam,
  canUpdateTaskPriority,
  canUpdateTaskStatus,
  isCompanyAdmin,
} from '@/lib/permissions';
import { StatusDropdown } from '@/components/tasks/StatusDropdown';
import { PriorityDropdown } from '@/components/tasks/PriorityDropdown';
import { DeadlinePicker } from '@/components/tasks/DeadlinePicker';
import { PendingStatusBadge } from '@/components/tasks/PendingStatusBadge';
import { ProposeConfirmDialog } from '@/components/tasks/ProposeConfirmDialog';
import { CommentList } from '@/components/comments/CommentList';
import { CommentInput } from '@/components/comments/CommentInput';
import { TaskFilesPanel } from '@/components/tasks/TaskFilesPanel';
import { TaskHistoryTimeline } from '@/components/tasks/TaskHistoryTimeline';
import { AssigneeAvatarStack } from '@/components/tasks/AssigneeAvatarStack';
import { AssigneePicker } from '@/components/tasks/AssigneePicker';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { utcTodayCalendarDate } from '@/lib/calendarDate';

interface TaskEditDraft {
  title: string;
  description: string;
  scopeItems: string;
  expectedOutput: string;
  assigneeIds: string[];
}

function createTaskEditDraft(task: Task): TaskEditDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    scopeItems: (task.scopeItems ?? []).join('\n'),
    expectedOutput: task.expectedOutput ?? '',
    assigneeIds: task.assignees.map((assignee) => assignee.userId),
  };
}

export function TaskDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const { data: task, isLoading } = useTask(id);
  const { data: teamDetail } = useTeam(task?.teamId);
  const { data: commentsData } = useTaskComments(id);
  const updateStatus = useUpdateTaskStatus();
  const proposeStatus = useProposeTaskStatus();
  const [proposeIntent, setProposeIntent] = useState<TaskStatus | null>(null);
  const ackStatus = useAckTaskStatus();
  const cancelStatus = useCancelTaskStatus();
  const updatePriority = useUpdateTaskPriority();
  const updateBlocked = useUpdateTaskBlocked();
  const updateFields = useUpdateTaskFields();
  const restoreTask = useRestoreTask();
  const deleteTask = useDeleteTask();
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<TaskEditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isBlockConfirming, setIsBlockConfirming] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const blockTriggerRef = useRef<HTMLButtonElement>(null);
  const wasDeleteConfirming = useRef(false);
  const wasBlockConfirming = useRef(false);
  const [restoreSelection, setRestoreSelection] = useState<{
    taskId: string;
    deadline: string | null;
  } | null>(null);
  const today = utcTodayCalendarDate();

  useEffect(() => {
    if (wasDeleteConfirming.current && !isDeleteConfirming) {
      deleteTriggerRef.current?.focus();
    }
    wasDeleteConfirming.current = isDeleteConfirming;
  }, [isDeleteConfirming]);

  useEffect(() => {
    if (wasBlockConfirming.current && !isBlockConfirming) {
      blockTriggerRef.current?.focus();
    }
    wasBlockConfirming.current = isBlockConfirming;
  }, [isBlockConfirming]);

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">{t('tasks.detail.loading')}</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8">
        <Link to="/tasks" className="text-sm text-primary hover:underline">
          {t('tasks.detail.back')}
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">{t('tasks.detail.notFound')}</p>
      </div>
    );
  }

  const isTeamAdminOfThisTeam =
    isCompanyAdmin(user) ||
    teamDetail?.members.some(
      (member) => member.userId === user?.id && member.role === 'teamAdmin',
    ) === true;

  const allowedStatus = canUpdateTaskStatus(user, task, isTeamAdminOfThisTeam);
  const allowedPriority = canUpdateTaskPriority(user, task, isTeamAdminOfThisTeam);
  const allowedDelete = canDeleteTask(user, task, isTeamAdminOfThisTeam);
  const allowedComment = canCommentOnTask(user, task, true);
  const allowedEdit = canManageTaskInTeam(user, task, isTeamAdminOfThisTeam);

  const hasPending = task.pendingStatus !== null;
  const youAreAssignee = task.assignees.some((a) => a.userId === user?.id);
  const yourAcked = task.statusAcks.some((a) => a.userId === user?.id);
  const isProposer = task.pendingProposedBy === user?.id;
  const proposerIsAssignee = task.assignees.some((a) => a.userId === task.pendingProposedBy);
  const canAck = hasPending && youAreAssignee && !yourAcked && !isProposer;
  const canCancel = hasPending && (isProposer || isTeamAdminOfThisTeam);
  const canRestore = task.archivedAt !== null && isTeamAdminOfThisTeam;
  const restoreDeadline =
    restoreSelection?.taskId === task.id
      ? restoreSelection.deadline
      : task.deadline && task.deadline >= today
        ? task.deadline
        : null;

  const handleStatusChange = (status: TaskStatus) => {
    if (!id) return;
    if (task.assignees.length > 1) {
      setProposeIntent(status);
    } else if (isTeamAdminOfThisTeam) {
      updateStatus.mutate({ taskId: id, status });
    } else {
      proposeStatus.mutate({ taskId: id, status });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteTask.mutateAsync(task.id);
    } finally {
      setIsDeleteConfirming(false);
    }
  };

  const handleBlockToggle = () => {
    if (!id) return;
    if (task.isBlocked) {
      updateBlocked.mutate({ taskId: id, isBlocked: false });
      return;
    }
    setBlockReason('');
    setIsBlockConfirming(true);
  };

  const handleBlockConfirm = () => {
    if (!id) return;
    updateBlocked.mutate({
      taskId: id,
      isBlocked: true,
      blockedReason: blockReason.trim().slice(0, 500) || null,
    });
    setIsBlockConfirming(false);
  };

  const handleBlockCancel = () => {
    setBlockReason('');
    setIsBlockConfirming(false);
  };

  const handleStartEdit = () => {
    setEditDraft(createTaskEditDraft(task));
    setEditError(null);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!id || !editDraft) return;
    setEditError(null);
    updateFields.mutate({
      taskId: id,
      title: editDraft.title.trim(),
      description: editDraft.description.trim() || null,
      scopeItems: editDraft.scopeItems
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      expectedOutput: editDraft.expectedOutput.trim() || null,
      assigneeIds: editDraft.assigneeIds,
    }, {
      onSuccess: () => {
        setIsEditing(false);
        setEditDraft(null);
        setEditError(null);
      },
      onError: (error) => {
        setEditError(getApiErrorMessage(error, t('tasks.detail.editError')));
      },
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditDraft(null);
    setEditError(null);
  };

  return (
    <div
      data-testid="task-detail-page"
      className="task-detail-page -m-4 min-h-full w-auto px-4 py-5 md:-m-8 md:px-4 md:py-4 lg:flex lg:h-[calc(100dvh-3.5rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-4"
    >
      <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-4 lg:shrink-0 lg:flex-nowrap">
        <Link
          to="/tasks"
          aria-label={t('tasks.detail.backAria')}
          className="inline-flex h-10 shrink-0 items-center gap-2 border-r border-border pr-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t('tasks.detail.returnToTasks')}
        </Link>
        <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-3">
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
            {task.title}
          </h1>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <StatusDropdown value={task.status} onChange={handleStatusChange} disabled={!allowedStatus} />
          {allowedEdit && (
            <button
              type="button"
              onClick={isEditing ? handleCancelEdit : handleStartEdit}
              disabled={isEditing && updateFields.isPending}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {isEditing ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Pencil aria-hidden="true" className="h-4 w-4" />
              )}
              {isEditing ? t('tasks.common.discard') : t('tasks.detail.edit')}
            </button>
          )}
        </div>
      </header>

      <div className="task-detail-workbench grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(220px,0.78fr)_minmax(0,1.85fr)_minmax(280px,1.1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
        <aside
          aria-label={t('tasks.detail.infoAria')}
          className="order-1 flex min-h-0 max-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg border border-border bg-card p-4 lg:order-none lg:col-start-1 lg:row-start-1 lg:max-h-none lg:min-h-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:bg-card lg:p-4"
        >
          <section
            aria-labelledby="task-information-heading"
            className="order-1 lg:order-none lg:shrink-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
          >
            <h2 id="task-information-heading" className="mb-4 text-lg font-semibold">
              {t('tasks.detail.info')}
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Flag aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs text-muted-foreground">{t('tasks.detail.priority')}</p>
                  <PriorityDropdown
                    value={task.priority}
                    onChange={(priority) => id && updatePriority.mutate({ taskId: id, priority })}
                    disabled={!allowedPriority}
                  />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarDays aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <DeadlinePicker
                    value={canRestore ? restoreDeadline : task.deadline}
                    onChange={(deadline) => {
                      if (canRestore) {
                        setRestoreSelection({ taskId: task.id, deadline });
                        return;
                      }
                      if (id) updateFields.mutate({ taskId: id, deadline });
                    }}
                    disabled={task.archivedAt !== null ? !canRestore : !allowedStatus}
                  />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UserRound aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('tasks.detail.assignee')}</p>
                  {isEditing && editDraft ? (
                    <div className="mt-1">
                      <AssigneePicker
                        members={(teamDetail?.members ?? []).map((member) => ({
                          id: member.userId,
                          fullName: member.fullName,
                          avatarUrl: member.avatarUrl,
                        }))}
                        value={editDraft.assigneeIds}
                        onChange={(assigneeIds) => setEditDraft({ ...editDraft, assigneeIds })}
                        label={t('tasks.assignee.addToTask')}
                        minSelected={1}
                      />
                    </div>
                  ) : task.assignees.length === 0 ? (
                    <p className="mt-1 text-sm italic text-muted-foreground">{t('tasks.assignee.noneAssigned')}</p>
                  ) : task.assignees.length > 2 ? (
                    <div className="mt-1" data-testid="assignee-chip-list">
                      <span data-testid="assignee-avatar-stack">
                        <AssigneeAvatarStack assignees={task.assignees} max={3} size="md" />
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-3" data-testid="assignee-chip-list">
                      {task.assignees.map((assignee) => (
                        <div key={assignee.userId} className="flex items-center gap-2 text-sm">
                          <Avatar className="h-7 w-7 shrink-0">
                            {assignee.user.avatarUrl && (
                              <AvatarImage src={assignee.user.avatarUrl} alt={assignee.user.fullName} />
                            )}
                            <AvatarFallback className="bg-secondary text-xs font-semibold">
                              {assignee.user.fullName.trim().charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 truncate">{assignee.user.fullName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UsersRound aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('tasks.detail.team')}</p>
                  <p className="mt-1 text-sm">{task.team.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UserRound aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('tasks.detail.creator')}</p>
                  <p className="mt-1 text-sm">{task.assigner.fullName}</p>
                </div>
              </div>
            </div>
            {allowedStatus && (
              isBlockConfirming ? (
                <form
                  data-testid="task-block-confirmation"
                  role="group"
                  aria-live="polite"
                  aria-labelledby="task-block-confirmation-title"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      handleBlockCancel();
                    }
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleBlockConfirm();
                  }}
                  className="mt-4 space-y-3 rounded-md border border-border bg-card p-3"
                >
                  <p id="task-block-confirmation-title" className="text-sm font-medium">
                    {t('tasks.detail.blockQuestion')}
                  </p>
                  <div>
                    <label htmlFor="task-block-reason" className="mb-1 block text-xs text-muted-foreground">
                      {t('tasks.detail.blockReason')}
                    </label>
                    <input
                      id="task-block-reason"
                      value={blockReason}
                      onChange={(event) => setBlockReason(event.target.value)}
                      maxLength={500}
                      autoFocus
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      data-testid="task-block-cancel"
                      onClick={handleBlockCancel}
                      disabled={updateBlocked.isPending}
                      className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('tasks.common.cancel')}
                    </button>
                    <button
                      type="submit"
                      data-testid="task-block-confirm"
                      disabled={updateBlocked.isPending}
                      className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updateBlocked.isPending ? t('tasks.detail.blocking') : t('tasks.detail.block')}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  data-testid="task-block-toggle"
                  ref={blockTriggerRef}
                  onClick={handleBlockToggle}
                  disabled={updateBlocked.isPending}
                  className="mt-4 h-9 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateBlocked.isPending
                    ? t('tasks.detail.updating')
                    : task.isBlocked
                      ? t('tasks.detail.unblock')
                      : t('tasks.detail.block')}
                </button>
              )
            )}
            {task.isBlocked && (
              <div
                data-testid="task-blocked-banner"
                className="mt-3 rounded-md border border-priority-high/40 bg-priority-high/10 p-3 text-sm"
              >
                <strong>{t('tasks.detail.blocked')}</strong>
                {task.blockedReason ? ` · ${task.blockedReason}` : null}
              </div>
            )}
          </section>

          {canRestore && (
            <div className="order-2 mt-3 lg:order-none">
              <button
                type="button"
                data-testid="restore-task-button"
                onClick={() =>
                  id &&
                  restoreDeadline &&
                  restoreTask.mutate({ taskId: id, deadline: restoreDeadline })
                }
                disabled={
                  restoreTask.isPending || restoreDeadline === null || restoreDeadline < today
                }
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {restoreTask.isPending ? t('tasks.detail.restorePending') : t('tasks.detail.restore')}
              </button>
              {restoreTask.isError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {getApiErrorMessage(restoreTask.error, t('tasks.detail.restoreError'))}
                </p>
              )}
            </div>
          )}

          <div className="order-3 mt-4 flex min-h-0 max-h-[20rem] flex-1 overflow-hidden border-t border-border pt-4 lg:order-none lg:max-h-none lg:flex lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:border-t lg:border-border lg:pt-4">
            <TaskHistoryTimeline taskId={task.id} />
          </div>
        </aside>

        <section
          role="region"
          aria-label={t('tasks.detail.content')}
          className="order-3 min-w-0 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-lg border border-border bg-card p-4 lg:col-start-2 lg:row-start-1 lg:order-none lg:max-h-none lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain md:p-5"
        >
          {hasPending && task.pendingStatus && (
            <div
              key={task.id}
              data-testid="pending-banner"
              className="task-pending-banner--pulse mb-6 rounded-md border border-primary/40 p-3"
            >
              <div className="flex items-start gap-3">
                <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-primary">{t('tasks.detail.pending')}</div>
                  <div className="mt-1 text-xs text-foreground/80">
                    {proposerIsAssignee
                      ? t('tasks.detail.pendingApproved', { name: task.pendingProposer?.fullName ?? t('tasks.detail.someone') })
                      : t('tasks.detail.pendingProposed', { name: task.pendingProposer?.fullName ?? t('tasks.detail.someone') })}{' '}
                    Kalan ack: {task.assignees.length - task.statusAcks.length} / {task.assignees.length}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                <PendingStatusBadge status={task.pendingStatus} />
                {canAck && (
                  <button
                    type="button"
                    onClick={() =>
                      id && ackStatus.mutate({ taskId: id, pendingVersion: task.pendingVersion })
                    }
                    disabled={ackStatus.isPending}
                    className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-black transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {ackStatus.isPending ? t('tasks.detail.approving') : t('tasks.detail.approve')}
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => id && cancelStatus.mutate(id)}
                    disabled={cancelStatus.isPending}
                    className="h-8 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    {cancelStatus.isPending ? t('tasks.detail.canceling') : t('tasks.common.cancel')}
                  </button>
                )}
              </div>
            </div>
          )}

          {isEditing && editDraft ? (
            <form
              data-testid="task-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveEdit();
              }}
              className="space-y-4 rounded-md border border-primary/50 bg-background p-4"
            >
              {editError && (
                <p role="alert" className="text-sm text-destructive">
                  {editError}
                </p>
              )}
              <div>
                <label htmlFor="task-edit-title" className="mb-1 block text-xs text-muted-foreground">
                  {t('tasks.detail.title')}
                </label>
                <input
                  id="task-edit-title"
                  value={editDraft.title}
                  onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="task-edit-description" className="mb-1 block text-xs text-muted-foreground">
                  {t('tasks.detail.description')}
                </label>
                <textarea
                  id="task-edit-description"
                  value={editDraft.description}
                  onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                  rows={4}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="task-edit-scope" className="mb-1 block text-xs text-muted-foreground">
                  {t('tasks.detail.scopeInput')}
                </label>
                <textarea
                  id="task-edit-scope"
                  value={editDraft.scopeItems}
                  onChange={(event) => setEditDraft({ ...editDraft, scopeItems: event.target.value })}
                  rows={4}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="task-edit-output" className="mb-1 block text-xs text-muted-foreground">
                    {t('tasks.detail.expectedOutput')}
                  </label>
                  <input
                    id="task-edit-output"
                    value={editDraft.expectedOutput}
                    onChange={(event) => setEditDraft({ ...editDraft, expectedOutput: event.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={updateFields.isPending}
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('tasks.common.discard')}
                </button>
                <button
                  type="submit"
                  disabled={updateFields.isPending || editDraft.title.trim().length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  {updateFields.isPending ? t('tasks.detail.saving') : t('tasks.detail.saveChanges')}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <section
                data-testid="task-title-section"
                aria-labelledby="title-heading"
                className="flex flex-wrap items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-sm font-medium">{t('tasks.detail.title')}</p>
                  <h2 id="title-heading" className="text-2xl font-semibold leading-tight tracking-tight">
                    {task.title}
                  </h2>
                </div>
                {allowedDelete && (
                  <div className="shrink-0">
                    {!isDeleteConfirming ? (
                      <button
                        type="button"
                        data-testid="task-delete-trigger"
                        ref={deleteTriggerRef}
                        onClick={() => setIsDeleteConfirming(true)}
                        disabled={deleteTask.isPending}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-priority-high/40 bg-priority-high/10 px-3 text-sm font-medium text-priority-high transition-colors hover:bg-priority-high/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {t('tasks.detail.delete')}
                      </button>
                    ) : (
                      <div
                        role="alertdialog"
                        aria-live="polite"
                        aria-labelledby="task-delete-confirmation"
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setIsDeleteConfirming(false);
                          }
                        }}
                        className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-priority-high/40 bg-priority-high/10 p-2"
                      >
                        <p id="task-delete-confirmation" className="text-sm text-priority-high">
                          {t('tasks.detail.deleteConfirm', { title: task.title })}
                        </p>
                        <button
                          type="button"
                          data-testid="task-delete-cancel"
                          onClick={() => setIsDeleteConfirming(false)}
                          disabled={deleteTask.isPending}
                          autoFocus
                          className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t('tasks.common.cancel')}
                        </button>
                        <button
                          type="button"
                          data-testid="task-delete-confirm"
                          onClick={handleDeleteConfirm}
                          disabled={deleteTask.isPending}
                          className="h-9 rounded-md bg-priority-high px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deleteTask.isPending ? t('tasks.detail.deleting') : t('tasks.detail.confirmDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section aria-labelledby="description-heading">
                <h2 id="description-heading" className="mb-2 text-sm font-medium">
                  {t('tasks.detail.description')}
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                  {task.description || (
                    <span className="italic text-muted-foreground">{t('tasks.detail.descriptionEmpty')}</span>
                  )}
                </p>
              </section>

              <section aria-labelledby="scope-heading">
                <h2 id="scope-heading" className="mb-2 text-sm font-medium">
                  {t('tasks.detail.scope')}
                </h2>
                {task.scopeItems && task.scopeItems.length > 0 ? (
                  <ul className="space-y-2 text-sm leading-6 text-foreground/90">
                    {task.scopeItems.map((item, index) => (
                      <li key={`${item}-${index}`} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    {t('tasks.detail.scopeEmpty')}
                  </p>
                )}
              </section>

              <div className="grid gap-6 sm:grid-cols-2">
              <section aria-labelledby="output-heading">
                  <h2 id="output-heading" className="mb-2 text-sm font-medium">
                  {t('tasks.detail.expectedOutput')}
                  </h2>
                  <p className="text-sm">
                    {task.expectedOutput || (
                      <span className="italic text-muted-foreground">{t('tasks.detail.unspecified')}</span>
                    )}
                  </p>
                </section>
              </div>
</div>
          )}

        </section>

        <aside
          aria-label={t('tasks.detail.filesAndComments')}
          className="contents lg:col-start-3 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-4"
        >
          <section
            data-testid="task-files-region"
            className="order-4 flex min-h-0 max-h-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-card p-4 lg:order-none lg:max-h-none lg:flex lg:min-h-0 lg:flex-1 lg:flex-[1_1_0%] lg:flex-col lg:overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
              <TaskFilesPanel taskId={task.id} />
            </div>
          </section>
          <section
            aria-labelledby="comments-heading"
            data-testid="task-comments-region"
            className="order-5 flex min-h-0 max-h-[28rem] flex-col overflow-hidden rounded-lg border border-border bg-card p-4 lg:order-none lg:max-h-none lg:flex lg:min-h-0 lg:flex-[2_1_0%] lg:flex-col lg:overflow-hidden"
          >
            <h2 id="comments-heading" className="mb-3 shrink-0 text-lg font-semibold">
              {t('tasks.detail.comments')} <span aria-hidden="true">({commentsData?.comments.length ?? 0})</span>
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
              <CommentList comments={commentsData?.comments ?? []} />
            </div>
            {allowedComment && id && (
              <div className="shrink-0">
                <CommentInput taskId={id} />
              </div>
            )}
          </section>
        </aside>
      </div>

      {ackStatus.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {['STALE_PENDING_VERSION', 'CONCURRENT_MODIFICATION'].includes(
            (ackStatus.error as { response?: { data?: { error?: string } } })?.response?.data
              ?.error ?? '',
          )
            ? t('tasks.detail.stalePending')
            : getApiErrorMessage(ackStatus.error, t('tasks.detail.stalePending'))}
        </p>
      )}

      {proposeIntent && task && (
        <ProposeConfirmDialog
          open
          task={task}
          newStatus={proposeIntent}
          isProposing={proposeStatus.isPending}
          onCancel={() => setProposeIntent(null)}
          onConfirm={() => {
            if (!id) return;
            proposeStatus.mutate(
              { taskId: id, status: proposeIntent },
              { onSettled: () => setProposeIntent(null) },
            );
          }}
        />
      )}
    </div>
  );
}
