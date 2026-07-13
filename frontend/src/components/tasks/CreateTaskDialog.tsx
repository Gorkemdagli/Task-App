import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCreateTask } from '@/hooks/tasks';
import type { TaskPriority } from '@/hooks/tasks';
import { PriorityDropdown } from './PriorityDropdown';
import { DeadlinePicker } from './DeadlinePicker';
import { AssigneePicker } from './AssigneePicker';

interface TeamMember {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  members: TeamMember[];
  defaultAssigneeId?: string;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  teamId,
  members,
  defaultAssigneeId,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssigneeId ?? members[0]?.id ?? '');

  const create = useCreateTask();

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDeadline(null);
    setAssigneeId(defaultAssigneeId ?? members[0]?.id ?? '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigneeId) return;
    await create.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      deadline: deadline ?? undefined,
      priority,
      assigneeId,
      teamId,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content
          data-testid="create-task-dialog"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-modal animate-in fade-in zoom-in-95"
        >
          <Dialog.Title className="mb-4 text-lg font-semibold">Yeni Görev</Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Başlık *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={3}
                maxLength={200}
                required
                autoFocus
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Açıklama</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={3}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Öncelik</label>
                <PriorityDropdown value={priority} onChange={setPriority} />
              </div>
              <DeadlinePicker value={deadline} onChange={setDeadline} />
            </div>
            <AssigneePicker members={members} value={assigneeId} onChange={setAssigneeId} />
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-10 rounded-md border border-border bg-secondary px-4 text-sm text-secondary-foreground transition-colors hover:border-primary/50"
                >
                  İptal
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={create.isPending || title.trim().length < 3 || !assigneeId}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {create.isPending ? 'Oluşturuluyor…' : 'Görev Oluştur'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
