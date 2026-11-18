import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { Task } from '../../hooks/tasks';
import { TaskAssigneeIdentity } from './TaskAssigneeIdentity';

export function PendingAckModal({
  task,
  yourAcked,
  canAck = !yourAcked,
  canCancel,
  onAck,
  onCancel,
  onClose,
  isAcking,
  isCanceling,
}: {
  task: Task;
  yourAcked: boolean;
  canAck?: boolean;
  canCancel: boolean;
  onAck: () => void;
  onCancel: () => void;
  onClose: () => void;
  isAcking: boolean;
  isCanceling: boolean;
}) {
  const { t } = useTranslation();
  const pendingStatus = task.pendingStatus;
  if (!pendingStatus) return null;

  const ackedUserIds = new Set(task.statusAcks.map((a) => a.userId));
  const proposer = task.pendingProposer;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="pt-14 [&>button]:h-11 [&>button]:w-11 sm:pt-6 sm:[&>button]:h-4 sm:[&>button]:w-4">
        <DialogHeader>
          <DialogTitle>{t('tasks.pending.proposalTitle', { status: t(`tasks.status.${pendingStatus}`) })}</DialogTitle>
          <DialogDescription>
            {proposer
              ? t('tasks.pending.proposalBy', { name: proposer.fullName, status: t(`tasks.status.${pendingStatus}`) })
              : t('tasks.pending.proposalGeneric')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-sm font-medium">{t('tasks.pending.assignees')}</div>
          <ul className="space-y-1.5">
            {task.assignees.map((a) => {
              const acked = ackedUserIds.has(a.userId);
              const isProposer = proposer?.id === a.userId;
              return (
                <li
                  key={a.userId}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                >
                  <TaskAssigneeIdentity
                    assignee={a}
                    suffix={
                      isProposer && <span className="text-xs text-muted-foreground">{t('tasks.pending.proposer')}</span>
                    }
                  />
                  {acked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="h-3 w-3" />
                      {t('tasks.pending.approved')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                      <X className="h-3 w-3" />
                      {t('tasks.pending.waiting')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="gap-2">
          {canCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={isAcking || isCanceling} className="h-11 sm:h-9">
              {isCanceling ? t('tasks.pending.canceling') : t('tasks.pending.cancel')}
            </Button>
          )}
          {canAck && !yourAcked && (
            <Button onClick={onAck} disabled={isAcking || isCanceling} className="h-11 sm:h-9">
              {isAcking ? t('tasks.pending.approving') : t('tasks.pending.approve')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
