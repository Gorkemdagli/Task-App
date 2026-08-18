import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { TaskPriority } from '@/hooks/tasks';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const PRIORITY_BG: Record<TaskPriority, string> = {
  high: 'bg-priority-high text-white',
  medium: 'bg-priority-medium text-black',
  low: 'bg-priority-low text-black',
};

interface PriorityDropdownProps {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
}

export function PriorityDropdown({ value, onChange, disabled }: PriorityDropdownProps) {
  return (
    // Dialog içinde: modal=false → Radix focus trap devre dışı,
    // Dialog'un onInteractOutside'ı dropdown item'ları "outside" sanıp kapatmasın.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Öncelik:
          <span
            className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium ${PRIORITY_BG[value]}`}
          >
            {PRIORITY_LABEL[value]}
          </span>
          <span className="text-xs">▾</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[160px] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-panel animate-in fade-in slide-in-from-top-1"
        >
          {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
            <DropdownMenu.Item
              key={p}
              onSelect={() => onChange(p)}
              className={`flex h-9 cursor-pointer items-center gap-2 px-3 text-sm outline-none data-[highlighted]:bg-secondary ${
                p === value ? 'border-l-2 border-primary bg-secondary/50' : ''
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  p === 'high'
                    ? 'bg-priority-high'
                    : p === 'medium'
                      ? 'bg-priority-medium'
                      : 'bg-priority-low'
                }`}
              />
              {PRIORITY_LABEL[p]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
