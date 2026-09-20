import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Save, X } from 'lucide-react';
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
import { PendingAckModal } from '@/components/tasks/PendingAckModal';
import { PendingStatusBadge } from '@/components/tasks/PendingStatusBadge';
import { ProposeConfirmDialog } from '@/components/tasks/ProposeConfirmDialog';
import { CommentList } from '@/components/comments/CommentList';
import { CommentInput } from '@/components/comments/CommentInput';
import { TaskFilesPanel } from '@/components/tasks/TaskFilesPanel';
import { TaskHistoryTimeline } from '@/components/tasks/TaskHistoryTimeline';
import { utcTodayCalendarDate } from '@/lib/calendarDate';

interface TaskEditDraft {
  title: string;
  description: string;
  scopeItems: string;
  targetAudience: string;
  expectedOutput: string;
  tags: string;
}

function createTaskEditDraft(task: Task): TaskEditDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    scopeItems: (task.scopeItems ?? []).join('\n'),
    targetAudience: task.targetAudience ?? '',
    expectedOutput: task.expectedOutput ?? '',
    tags: (task.tags ?? []).join(', '),
  };
}

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

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: 'text-status-todo',
  in_progress: 'text-status-inprogress',
  done: 'text-status-done',
};

const PRIORITY_TONE: Record<Task['priority'], string> = {
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
};

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const { data: task, isLoading } = useTask(id);
  const { data: teamDetail } = useTeam(task?.teamId);
  const { data: commentsData } = useTaskComments(id);
  const updateStatus = useUpdateTaskStatus();
  const proposeStatus = useProposeTaskStatus();
  const [proposeIntent, setProposeIntent] = useState<TaskStatus | null>(null);
  const [ackModalDismissed, setAckModalDismissed] = useState(false);
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
  const [restoreSelection, setRestoreSelection] = useState<{
    taskId: string;
    deadline: string | null;
  } | null>(null);
  const today = utcTodayCalendarDate();

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8">
        <Link to="/tasks" className="text-sm text-primary hover:underline">
          ← Görevlerim
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">Görev bulunamadı.</p>
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

  const handleDelete = async () => {
    if (!confirm('Bu görevi silmek istediğine emin misin?')) return;
    await deleteTask.mutateAsync(task.id);
  };

  const handleBlockToggle = () => {
    if (!id) return;
    if (task.isBlocked) {
      updateBlocked.mutate({ taskId: id, isBlocked: false });
      return;
    }
    const blockedReason = window.prompt('Engel nedeni (isteğe bağlı)')?.trim() || null;
    updateBlocked.mutate({ taskId: id, isBlocked: true, blockedReason });
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
      targetAudience: editDraft.targetAudience.trim() || null,
      expectedOutput: editDraft.expectedOutput.trim() || null,
      tags: editDraft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }, {
      onSuccess: () => {
        setIsEditing(false);
        setEditDraft(null);
        setEditError(null);
      },
      onError: (error) => {
        setEditError(getApiErrorMessage(error, 'Değişiklikler kaydedilemedi. Tekrar deneyin.'));
      },
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditDraft(null);
    setEditError(null);
  };

  return (
    <div data-testid="task-detail-page" className="w-full px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-start gap-4 border-b border-border pb-5">
        <Link
          to="/tasks"
          aria-label="Görevlerim'e dön"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Görevlerim
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className={STATUS_TONE[task.status]}>Durum: {STATUS_LABEL[task.status]}</span>
            <span className={PRIORITY_TONE[task.priority]}>
              Öncelik: {PRIORITY_LABEL[task.priority]}
            </span>
            {task.archivedAt && <span>Arşivlendi</span>}
          </div>
        </div>
        {allowedEdit && (
          <button
            type="button"
            onClick={isEditing ? handleCancelEdit : handleStartEdit}
            disabled={isEditing && updateFields.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEditing ? (
              <X aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Pencil aria-hidden="true" className="h-4 w-4" />
            )}
            {isEditing ? 'Vazgeç' : 'Düzenle'}
          </button>
        )}
      </header>

      <div className="task-detail-workbench grid grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.75fr)_minmax(280px,0.95fr)] lg:items-start">
        <aside
          aria-label="Görev bilgileri ve geçmiş"
          className="contents lg:col-start-1 lg:row-start-1 lg:block"
        >
          <section
            aria-labelledby="task-controls-heading"
            className="order-1 rounded-lg border border-border bg-card p-4 lg:order-none"
          >
            <h2 id="task-controls-heading" className="mb-3 text-sm font-semibold">
              Görev kontrolleri
            </h2>
            <div className="flex flex-wrap gap-2">
              <StatusDropdown
                value={task.status}
                onChange={handleStatusChange}
                disabled={!allowedStatus}
              />
              <PriorityDropdown
                value={task.priority}
                onChange={(priority) => id && updatePriority.mutate({ taskId: id, priority })}
                disabled={!allowedPriority}
              />
            </div>
            {allowedStatus && (
              <button
                type="button"
                data-testid="task-block-toggle"
                onClick={handleBlockToggle}
                disabled={updateBlocked.isPending}
                className="mt-3 h-9 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updateBlocked.isPending
                  ? 'Güncelleniyor…'
                  : task.isBlocked
                    ? 'Engeli kaldır'
                    : 'Engelle'}
              </button>
            )}
            {task.isBlocked && (
              <div
                data-testid="task-blocked-banner"
                className="mt-3 rounded-md border border-priority-high/40 bg-priority-high/10 p-3 text-sm"
              >
                <strong>Engellendi</strong>
                {task.blockedReason ? ` · ${task.blockedReason}` : null}
              </div>
            )}
          </section>

          <section
            aria-labelledby="task-information-heading"
            className="order-2 rounded-lg border border-border bg-card p-4 lg:order-none lg:mt-6"
          >
            <h2 id="task-information-heading" className="mb-4 text-lg font-semibold">
              Görev bilgileri
            </h2>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Görevi Veren</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                    {task.assigner.fullName.charAt(0)}
                  </span>
                  {task.assigner.fullName}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Görevi Alanlar</p>
                {task.assignees.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">Atanmış kişi yok</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5" data-testid="assignee-chip-list">
                    {task.assignees.map((assignee) => (
                      <span
                        key={assignee.userId}
                        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-semibold">
                          {assignee.user.fullName.charAt(0)}
                        </span>
                        {assignee.user.fullName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
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
                {canRestore && (
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
                    className="mt-2 h-9 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoreTask.isPending ? 'Aktifleştiriliyor…' : 'Görevi Aktifleştir'}
                  </button>
                )}
                {restoreTask.isError && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {getApiErrorMessage(restoreTask.error, 'Görev aktifleştirilemedi.')}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Takım</p>
                <div className="text-sm">{task.team.name}</div>
              </div>
            </div>
          </section>

          <div className="order-6 lg:order-none lg:mt-6">
            <TaskHistoryTimeline taskId={task.id} />
          </div>
        </aside>

        <section
          role="region"
          aria-label="Görev içeriği"
          className="order-3 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:order-none"
        >
          {hasPending && task.pendingStatus && (
            <div
              data-testid="pending-banner"
              className="mb-6 rounded-md border border-primary/40 bg-primary/10 p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-primary">
                    {proposerIsAssignee
                      ? `${task.pendingProposer?.fullName ?? 'Biri'} status değişikliği önerdi ve onayladı`
                      : `${task.pendingProposer?.fullName ?? 'Biri'} status değişikliği teklif etti`}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Kalan ack: {task.assignees.length - task.statusAcks.length} /{' '}
                    {task.assignees.length}
                  </div>
                </div>
                <PendingStatusBadge status={task.pendingStatus} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {canAck && (
                  <button
                    type="button"
                    onClick={() =>
                      id && ackStatus.mutate({ taskId: id, pendingVersion: task.pendingVersion })
                    }
                    disabled={ackStatus.isPending}
                    className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {ackStatus.isPending ? 'Onaylanıyor...' : 'Onayla'}
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => id && cancelStatus.mutate(id)}
                    disabled={cancelStatus.isPending}
                    className="h-9 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    {cancelStatus.isPending ? 'İptal ediliyor...' : 'İptal'}
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
              className="space-y-4 rounded-lg border border-primary/50 bg-card p-5"
            >
              {editError && (
                <p role="alert" className="text-sm text-destructive">
                  {editError}
                </p>
              )}
              <div>
                <label htmlFor="task-edit-title" className="mb-1 block text-xs text-muted-foreground">
                  Başlık
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
                  Açıklama
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
                  Kapsam (her satır bir madde)
                </label>
                <textarea
                  id="task-edit-scope"
                  value={editDraft.scopeItems}
                  onChange={(event) => setEditDraft({ ...editDraft, scopeItems: event.target.value })}
                  rows={4}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="task-edit-audience" className="mb-1 block text-xs text-muted-foreground">
                    Hedef kitle
                  </label>
                  <input
                    id="task-edit-audience"
                    value={editDraft.targetAudience}
                    onChange={(event) => setEditDraft({ ...editDraft, targetAudience: event.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="task-edit-output" className="mb-1 block text-xs text-muted-foreground">
                    Beklenen çıktı
                  </label>
                  <input
                    id="task-edit-output"
                    value={editDraft.expectedOutput}
                    onChange={(event) => setEditDraft({ ...editDraft, expectedOutput: event.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="task-edit-tags" className="mb-1 block text-xs text-muted-foreground">
                  Etiketler (virgülle ayır)
                </label>
                <input
                  id="task-edit-tags"
                  value={editDraft.tags}
                  onChange={(event) => setEditDraft({ ...editDraft, tags: event.target.value })}
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
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={updateFields.isPending || editDraft.title.trim().length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  {updateFields.isPending ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="description-heading">
                <h2 id="description-heading" className="mb-2 text-sm font-medium">
                  Açıklama
                </h2>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-card p-5 text-sm leading-6">
                  {task.description || (
                    <span className="italic text-muted-foreground">Açıklama eklenmemiş.</span>
                  )}
                </p>
              </section>

              <section aria-labelledby="scope-heading">
                <h2 id="scope-heading" className="mb-2 text-sm font-medium">
                  Kapsam
                </h2>
                {task.scopeItems && task.scopeItems.length > 0 ? (
                  <ul className="space-y-2 rounded-lg border border-border bg-card p-5 text-sm leading-6">
                    {task.scopeItems.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-border bg-card p-5 text-sm italic text-muted-foreground">
                    Kapsam belirtilmemiş.
                  </p>
                )}
              </section>

              <div className="grid gap-6 sm:grid-cols-2">
                <section aria-labelledby="audience-heading">
                  <h2 id="audience-heading" className="mb-2 text-sm font-medium">
                    Hedef kitle
                  </h2>
                  <p className="rounded-lg border border-border bg-card p-5 text-sm">
                    {task.targetAudience || (
                      <span className="italic text-muted-foreground">Belirtilmemiş.</span>
                    )}
                  </p>
                </section>
                <section aria-labelledby="output-heading">
                  <h2 id="output-heading" className="mb-2 text-sm font-medium">
                    Beklenen çıktı
                  </h2>
                  <p className="rounded-lg border border-border bg-card p-5 text-sm">
                    {task.expectedOutput || (
                      <span className="italic text-muted-foreground">Belirtilmemiş.</span>
                    )}
                  </p>
                </section>
              </div>

              <section aria-labelledby="tags-heading">
                <h2 id="tags-heading" className="mb-2 text-sm font-medium">
                  Etiketler
                </h2>
                {task.tags && task.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {task.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-sm border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">Etiket yok.</p>
                )}
              </section>
            </div>
          )}

          {allowedDelete && (
            <section className="mt-8 border-t border-border pt-6">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteTask.isPending}
                className="h-9 rounded-md border border-priority-high/40 bg-priority-high/10 px-4 text-sm font-medium text-priority-high transition-colors hover:bg-priority-high/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteTask.isPending ? 'Siliniyor…' : 'Görevi Sil'}
              </button>
            </section>
          )}
        </section>

        <aside
          aria-label="Dosyalar ve yorumlar"
          className="contents lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:block"
        >
          <section className="order-4 rounded-lg border border-border bg-card p-4 lg:order-none">
            <TaskFilesPanel taskId={task.id} />
          </section>
          <section
            aria-labelledby="comments-heading"
            className="order-5 rounded-lg border border-border bg-card p-4 lg:order-none lg:mt-6"
          >
            <h2 id="comments-heading" className="mb-3 text-lg font-semibold">
              Yorumlar
            </h2>
            <CommentList comments={commentsData?.comments ?? []} />
            {allowedComment && id && <CommentInput taskId={id} />}
          </section>
        </aside>
      </div>

      {hasPending && !ackModalDismissed && !isProposer && task && (
        <PendingAckModal
          task={task}
          yourAcked={yourAcked}
          canAck={canAck}
          canCancel={canCancel}
          onAck={() => id && ackStatus.mutate({ taskId: id, pendingVersion: task.pendingVersion })}
          onCancel={() => id && cancelStatus.mutate(id)}
          onClose={() => setAckModalDismissed(true)}
          isAcking={ackStatus.isPending}
          isCanceling={cancelStatus.isPending}
        />
      )}

      {ackStatus.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {['STALE_PENDING_VERSION', 'CONCURRENT_MODIFICATION'].includes(
            (ackStatus.error as { response?: { data?: { error?: string } } })?.response?.data
              ?.error ?? '',
          )
            ? 'Teklif değişti. Güncel durum yüklendi.'
            : getApiErrorMessage(ackStatus.error, 'Teklif değişti. Güncel durum yüklendi.')}
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
