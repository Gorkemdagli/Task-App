import { Send } from 'lucide-react';
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

export function ProposeConfirmDialog({
  open,
  task,
  newStatus,
  onConfirm,
  onCancel,
  isProposing,
}: {
  open: boolean;
  task: Task;
  newStatus: TaskStatus;
  onConfirm: () => void;
  onCancel: () => void;
  isProposing: boolean;
}) {
  const proposer = task.pendingProposer;
  // Propose henüz server'a gitmedi → pendingProposer set olmayabilir (actor kendisi).
  // Actor = drag eden kişi, modal onu öneren olarak gösterir.
  const otherAssignees = task.assignees.filter((a) => a.userId !== proposer?.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isProposing && onCancel()}>
      <DialogContent data-testid="propose-confirm-dialog">
        <DialogHeader>
          <DialogTitle>Status değişikliği teklif et</DialogTitle>
          <DialogDescription>
            {`"${task.title}" görevini "${STATUS_LABEL[newStatus]}" olarak değiştirmek istiyorsun. Diğer atananların onayı gerekli.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-sm font-medium">Onaylaması gerekenler</div>
          {otherAssignees.length === 0 ? (
            <p className="text-xs text-muted-foreground">Başka atanan yok.</p>
          ) : (
            <ul className="space-y-1.5">
              {otherAssignees.map((a) => (
                <li key={a.userId} className="rounded-md border bg-card px-3 py-2">
                  <TaskAssigneeIdentity assignee={a} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isProposing}
            data-testid="propose-cancel"
          >
            İptal
          </Button>
          <Button onClick={onConfirm} disabled={isProposing} data-testid="propose-confirm">
            <Send className="mr-1 h-3 w-3" />
            {isProposing ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
