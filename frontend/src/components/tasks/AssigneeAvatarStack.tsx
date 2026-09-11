import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

export interface AvatarStackMember {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

interface AvatarStackProps {
  members: AvatarStackMember[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  withNames?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<AssigneeAvatarStackProps['size']>, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-[11px]',
  md: 'h-7 w-7 text-xs',
};
const SIZE_PX: Record<NonNullable<AssigneeAvatarStackProps['size']>, number> = {
  xs: 20,
  sm: 24,
  md: 28,
};

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function AvatarMember({ member, size }: { member: AvatarStackMember; size: 'xs' | 'sm' | 'md' }) {
  return (
    <Avatar
      className={cn(
        SIZE_CLASS[size],
        'border-2 border-background transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-lg',
      )}
    >
      {member.avatarUrl && (
        <AvatarImage
          src={member.avatarUrl}
          alt={member.fullName}
          width={SIZE_PX[size]}
          height={SIZE_PX[size]}
        />
      )}
      <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
        {avatarInitial(member.fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

export function AvatarStack({
  members,
  max = 2,
  size = 'sm',
  withNames = false,
  className,
}: AvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="relative flex items-center rounded-full border border-border bg-background p-1">
        {visible.map((member, index) => (
          <span
            key={member.id}
            title={member.fullName}
            className={cn('relative hover:z-10', index > 0 && '-ml-2')}
          >
            <AvatarMember member={member} size={size} />
          </span>
        ))}
        {overflow > 0 && (
          <span
            aria-label={`+${overflow} kişi daha`}
            title={`+${overflow} kişi daha`}
            className={cn(
              SIZE_CLASS[size],
              'relative inline-flex items-center justify-center rounded-full border-2 border-background bg-secondary font-semibold text-secondary-foreground transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-lg',
            )}
          >
            +{overflow}
          </span>
        )}
      </span>
      {withNames && visible.length === 1 && (
        <span className="truncate text-xs text-muted-foreground">{visible[0].fullName}</span>
      )}
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
  return (
    <AvatarStack
      members={assignees.map(({ userId, user }) => ({
        id: userId,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
      }))}
      max={max}
      size={size}
      withNames={withNames}
      className={className}
    />
  );
}
