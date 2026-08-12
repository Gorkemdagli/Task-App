import { Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { Task, TaskStatus } from '../../hooks/tasks';
import { TaskAssigneeIdentity } from './TaskAssigneeIdentity';

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

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
  const pendingStatus = task.pendingStatus;
  if (!pendingStatus) return null;

  const ackedUserIds = new Set(task.statusAcks.map((a) => a.userId));
  const proposer = task.pendingProposer;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Status teklifi: {STATUS_LABEL[pendingStatus]}</DialogTitle>
          <DialogDescription>
            {proposer
              ? `${proposer.fullName} bu görevi "${STATUS_LABEL[pendingStatus]}" olarak değiştirmek istiyor.`
              : 'Status değişikliği teklif edildi.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-sm font-medium">Atananlar</div>
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
                      isProposer && <span className="text-xs text-muted-foreground">(öneren)</span>
                    }
                  />
                  {acked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="h-3 w-3" />
                      Onayladı
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                      <X className="h-3 w-3" />
                      Bekliyor
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="gap-2">
          {canCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={isAcking || isCanceling}>
              {isCanceling ? 'İptal ediliyor...' : 'İptal'}
            </Button>
          )}
          {canAck && !yourAcked && (
            <Button onClick={onAck} disabled={isAcking || isCanceling}>
              {isAcking ? 'Onaylanıyor...' : 'Onayla'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
