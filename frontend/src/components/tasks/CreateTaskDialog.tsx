import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import type { AxiosError } from 'axios';
import { useCreateTask } from '@/hooks/tasks';
import type { TaskPriority } from '@/hooks/tasks';
import { PriorityDropdown } from './PriorityDropdown';
import { DeadlinePicker } from './DeadlinePicker';
import { AssigneePicker, type AssigneeOption } from './AssigneePicker';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  members: AssigneeOption[];
}

export function CreateTaskDialog({ open, onOpenChange, teamId, members }: CreateTaskDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scopeText, setScopeText] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateTask();

  const reset = () => {
    setTitle('');
    setDescription('');
    setScopeText('');
    setExpectedOutput('');
    setPriority('medium');
    setDeadline(null);
    setAssigneeIds([]);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setError(null);
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (assigneeIds.length === 0 || !deadline) return;
    setError(null);
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        scopeItems: scopeText
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        expectedOutput: expectedOutput.trim() || null,
        deadline: deadline ?? undefined,
        priority,
        assigneeIds,
        teamId,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      const ax = err as AxiosError<{ message?: string; issues?: { message: string }[] }>;
      const msg =
        ax.response?.data?.message ??
        ax.response?.data?.issues?.[0]?.message ??
        t('tasks.create.error');
      setError(msg);
    }
  };

  const noAssignees = assigneeIds.length === 0;
  const noDeadline = !deadline;
  const submitDisabled = create.isPending || title.trim().length < 3 || noAssignees || noDeadline;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content
          data-testid="create-task-dialog"
          className="fixed inset-0 z-50 flex h-dvh max-h-dvh w-full flex-col overflow-hidden border-0 bg-card p-0 text-card-foreground shadow-modal animate-in fade-in zoom-in-95 md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[calc(100%-2rem)] md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:p-6"
        >
          <div className="flex shrink-0 items-center justify-between bg-card px-6 py-4 md:-mx-6 md:-mt-6 md:mb-4 md:px-6 md:pb-2 md:pt-6">
            <Dialog.Title className="text-lg font-semibold">{t('tasks.create.title')}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('tasks.create.close')}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-6 md:p-0">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('tasks.create.taskTitle')}</label>
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
              <label className="mb-1 block text-xs text-muted-foreground">{t('tasks.create.description')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="task-create-scope" className="mb-1 block text-xs text-muted-foreground">
                {t('tasks.create.scope')}
              </label>
              <textarea
                id="task-create-scope"
                value={scopeText}
                onChange={(e) => setScopeText(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="task-create-expected-output" className="mb-1 block text-xs text-muted-foreground">
                {t('tasks.create.output')}
              </label>
              <textarea
                id="task-create-expected-output"
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('tasks.create.priority')}</label>
                <PriorityDropdown value={priority} onChange={setPriority} />
              </div>
              <DeadlinePicker
                value={deadline}
                onChange={setDeadline}
                required
                invalid={noDeadline}
              />
            </div>
            <AssigneePicker
              members={members}
              value={assigneeIds}
              onChange={setAssigneeIds}
              invalid={noAssignees}
            />
            {noAssignees && (
              <p
                role="alert"
                data-testid="assignee-required-hint"
                className="text-xs text-destructive"
              >
                {t('tasks.create.assigneeRequired')}
              </p>
            )}
            {error && (
              <p
                role="alert"
                data-testid="create-task-error"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-10 rounded-md border border-border bg-secondary px-4 text-sm text-secondary-foreground transition-colors hover:border-primary/50"
                >
                  {t('tasks.create.cancel')}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitDisabled}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {create.isPending ? t('tasks.create.submitting') : t('tasks.create.submit')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
