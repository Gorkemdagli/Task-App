import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/hooks/tasks';

interface StatusDropdownProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}

export function StatusDropdown({ value, onChange, disabled }: StatusDropdownProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('tasks.columns.status')}: <span className="font-medium">{t(`tasks.status.${value}`)}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
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
              {t(`tasks.status.${s}`)}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
