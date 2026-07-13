import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { TaskStatus } from '@/hooks/tasks';

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

interface StatusDropdownProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}

export function StatusDropdown({ value, onChange, disabled }: StatusDropdownProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Durum: <span className="font-medium">{STATUS_LABEL[value]}</span>
          <span className="text-xs">▾</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-panel animate-in fade-in slide-in-from-top-1"
        >
          {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
            <DropdownMenu.Item
              key={s}
              onSelect={() => onChange(s)}
              className={`flex h-9 cursor-pointer items-center px-3 text-sm outline-none data-[highlighted]:bg-secondary ${
                s === value ? 'border-l-2 border-primary bg-secondary/50' : ''
              }`}
            >
              {STATUS_LABEL[s]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
