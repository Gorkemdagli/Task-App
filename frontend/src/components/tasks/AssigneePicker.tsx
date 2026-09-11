import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { AvatarStack } from './AssigneeAvatarStack';

export interface AssigneeOption {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

interface AssigneePickerProps {
  members: AssigneeOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

const SIZE_PX = { xs: 20, sm: 24, md: 28 } as const;

function Avatar({ member, size = 'sm' }: { member: AssigneeOption; size?: 'xs' | 'sm' | 'md' }) {
  const sizeClass =
    size === 'xs'
      ? 'h-5 w-5 text-[10px]'
      : size === 'md'
        ? 'h-7 w-7 text-xs'
        : 'h-6 w-6 text-[11px]';
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.fullName}
        loading="lazy"
        decoding="async"
        width={SIZE_PX[size]}
        height={SIZE_PX[size]}
        className={cn(sizeClass, 'rounded-full object-cover')}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        sizeClass,
        'inline-flex items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground',
      )}
    >
      {avatarInitial(member.fullName)}
    </span>
  );
}

export function AssigneePicker({
  members,
  value,
  onChange,
  disabled,
  invalid,
}: AssigneePickerProps) {
  const selectedSet = new Set(value);
  const selectedMembers = value
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is AssigneeOption => !!m);

  const toggle = (id: string) => {
    const next = selectedSet.has(id) ? value.filter((x) => x !== id) : [...value, id];
    onChange(next);
  };

  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  const triggerLabel =
    selectedMembers.length === 0
      ? 'Kişi Ekle'
      : selectedMembers.length === 1
        ? selectedMembers[0].fullName
        : `${selectedMembers.length} kişi seçildi`;

  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Atanan Kişiler</label>
      {/* Dialog içinde Radix DropdownMenu modal=false — focus trap + onInteractOutside çakışmasını önler */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            data-testid="assignee-picker-trigger"
            data-invalid={invalid ? 'true' : undefined}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-md border bg-background px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary',
              invalid ? 'border-destructive' : 'border-input hover:border-primary/50',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {selectedMembers.length > 0 ? (
              <AvatarStack members={selectedMembers} max={2} size="sm" />
            ) : null}
            <span className="truncate text-foreground">{triggerLabel}</span>
            <span className="ml-auto text-xs text-muted-foreground">▾</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="z-50 min-w-[220px] max-h-60 overflow-auto rounded-md border border-border bg-card text-card-foreground shadow-panel animate-in fade-in slide-in-from-top-1"
          >
            {members.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Takım üyesi yok</div>
            ) : (
              members.map((m) => {
                const checked = selectedSet.has(m.id);
                return (
                  <DropdownMenu.CheckboxItem
                    key={m.id}
                    checked={checked}
                    onCheckedChange={() => toggle(m.id)}
                    onSelect={(e) => e.preventDefault()}
                    data-testid={`assignee-option-${m.id}`}
                    className="flex h-9 cursor-pointer items-center gap-2 px-3 text-sm outline-none data-[highlighted]:bg-secondary"
                  >
                    <Avatar member={m} size="sm" />
                    <span className="flex-1 truncate">{m.fullName}</span>
                    <DropdownMenu.ItemIndicator>
                      <span aria-hidden className="text-primary">
                        ✓
                      </span>
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.CheckboxItem>
                );
              })
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {selectedMembers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="assignee-chips">
          {selectedMembers.map((m) => (
            <span
              key={m.id}
              data-testid={`assignee-chip-${m.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              <Avatar member={m} size="xs" />
              <span className="max-w-[140px] truncate">{m.fullName}</span>
              <button
                type="button"
                aria-label={`${m.fullName} kaldır`}
                onClick={() => remove(m.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
