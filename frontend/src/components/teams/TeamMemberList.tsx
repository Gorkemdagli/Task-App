import type { ReactNode } from 'react';
import type { TeamMember } from '@/services/teams';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface TeamMemberListProps {
  members: TeamMember[];
  compact?: boolean;
  renderAction?: (member: TeamMember) => ReactNode;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function TeamMemberList({ members, compact = false, renderAction }: TeamMemberListProps) {
  return (
    <ul
      className={cn(
        compact ? 'space-y-1' : 'divide-y divide-border rounded-lg border border-border bg-card',
      )}
      role="list"
    >
      {members.map((member) => (
        <li
          key={member.userId}
          className={cn(
            'flex items-center justify-between gap-3',
            compact ? 'rounded-md px-2 py-2 hover:bg-secondary' : 'px-4 py-3',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className={compact ? 'h-7 w-7' : undefined}>
              {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.fullName} />}
              <AvatarFallback
                className={cn(
                  compact && 'bg-secondary text-[11px] font-semibold text-foreground',
                  !compact && 'text-xs',
                )}
              >
                {initials(member.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p
                className={cn(
                  'truncate',
                  compact ? 'text-sm text-foreground' : 'text-sm font-medium text-foreground',
                )}
              >
                {member.fullName}
              </p>
              <p
                className={cn(
                  'font-mono',
                  compact
                    ? 'text-[11px] text-secondary-foreground'
                    : 'text-xs text-secondary-foreground',
                )}
              >
                {member.displayId}
              </p>
            </div>
          </div>
          {renderAction?.(member)}
        </li>
      ))}
    </ul>
  );
}
