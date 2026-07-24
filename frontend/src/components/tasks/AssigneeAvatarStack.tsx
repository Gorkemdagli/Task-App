import type { TaskAssignee } from '@/hooks/tasks';
import { cn } from '@/lib/utils';

interface AssigneeAvatarStackProps {
  assignees: TaskAssignee[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  withNames?: boolean;
  /** Yalnız taşma rozetini göster (avatar yok); default false */
  overflowOnly?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<AssigneeAvatarStackProps['size']>, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-[11px]',
  md: 'h-7 w-7 text-xs',
};

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function Avatar({
  assignee,
  size,
}: {
  assignee: TaskAssignee;
  size: NonNullable<AssigneeAvatarStackProps['size']>;
}) {
  const { user } = assignee;
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.fullName}
        title={user.fullName}
        className={cn(SIZE_CLASS[size], 'rounded-full object-cover')}
      />
    );
  }
  return (
    <span
      aria-hidden
      title={user.fullName}
      className={cn(
        SIZE_CLASS[size],
        'inline-flex items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground',
      )}
    >
      {avatarInitial(user.fullName)}
    </span>
  );
}

export function AssigneeAvatarStack({
  assignees,
  max = 2,
  size = 'sm',
  withNames = false,
  className,
}: AssigneeAvatarStackProps) {
  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="flex -space-x-2">
        {visible.map((a) => (
          <span key={a.userId} className="ring-2 ring-card rounded-full">
            <Avatar assignee={a} size={size} />
          </span>
        ))}
        {overflow > 0 && (
          <span
            aria-label={`+${overflow} kişi daha`}
            title={`+${overflow} kişi daha`}
            className={cn(
              SIZE_CLASS[size],
              'inline-flex items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ring-2 ring-card',
            )}
          >
            +{overflow}
          </span>
        )}
      </span>
      {withNames && visible.length === 1 && (
        <span className="truncate text-xs text-muted-foreground">{visible[0].user.fullName}</span>
      )}
    </span>
  );
}
