import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useTask,
  useTaskComments,
  useUpdateTaskStatus,
  useProposeTaskStatus,
  useAckTaskStatus,
  useCancelTaskStatus,
  useUpdateTaskPriority,
  useUpdateTaskFields,
  useDeleteTask,
  type TaskStatus,
} from '@/hooks/tasks';
import { useAuthStore } from '@/stores/authStore';
import { useTeam } from '@/hooks/queries/useTeams';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  canCommentOnTask,
  canDeleteTask,
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
  const updateFields = useUpdateTaskFields();
  const deleteTask = useDeleteTask();

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

  const hasPending = task.pendingStatus !== null;
  const youAreAssignee = task.assignees.some((a) => a.userId === user?.id);
  const yourAcked = task.statusAcks.some((a) => a.userId === user?.id);
  const isProposer = task.pendingProposedBy === user?.id;
  const proposerIsAssignee = task.assignees.some((a) => a.userId === task.pendingProposedBy);
  const canAck = hasPending && youAreAssignee && !yourAcked && !isProposer;
  const canCancel = hasPending && (isProposer || isTeamAdminOfThisTeam);

  const handleStatusChange = (status: TaskStatus) => {
    if (!id) return;
    if (task.assignees.length > 1) {
      setProposeIntent(status); // admin + member → modal
    } else if (isTeamAdminOfThisTeam) {
      updateStatus.mutate({ taskId: id, status }); // tek + admin → direct
    } else {
      proposeStatus.mutate({ taskId: id, status }); // tek + member → atomic
    }
  };

  const handleDelete = async () => {
    if (!confirm('Bu görevi silmek istediğine emin misin?')) return;
    await deleteTask.mutateAsync(task.id);
  };

  return (
    <div data-testid="task-detail-page" className="mx-auto max-w-3xl p-8">
      <Link
        to="/tasks"
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-primary"
      >
        ← Görevlerim
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">{task.title}</h1>

      {hasPending && task.pendingStatus && (
        <div
          data-testid="pending-banner"
          className="mb-6 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
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

      <div className="mb-6 flex flex-wrap items-center gap-3">
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

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Görevi Veren</label>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
              {task.assigner.fullName.charAt(0)}
            </span>
            {task.assigner.fullName}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Görevi Alanlar</label>
          {task.assignees.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Atanmış kişi yok</p>
          ) : (
            <div className="flex flex-wrap gap-1.5" data-testid="assignee-chip-list">
              {task.assignees.map((a) => (
                <span
                  key={a.userId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background text-[10px] font-semibold">
                    {a.user.fullName.charAt(0)}
                  </span>
                  {a.user.fullName}
                </span>
              ))}
            </div>
          )}
        </div>
        <DeadlinePicker
          value={task.deadline}
          onChange={(deadline) => id && updateFields.mutate({ taskId: id, deadline })}
          disabled={!allowedStatus}
        />
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Takım</label>
          <div className="text-sm">{task.team.name}</div>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Açıklama</h2>
        <p className="whitespace-pre-wrap rounded-md border border-border bg-card p-4 text-sm">
          {task.description || (
            <span className="italic text-muted-foreground">Açıklama eklenmemiş.</span>
          )}
        </p>
      </section>

      <section className="mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">
            Yorumlar ({commentsData?.comments.length ?? 0})
          </h2>
          <CommentList comments={commentsData?.comments ?? []} />
          {allowedComment && id && <CommentInput taskId={id} />}
        </div>
      </section>

      {allowedDelete && (
        <section className="border-t border-border pt-6">
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
