import { useState } from 'react';
import type { TeamMember } from '@/services/teams';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useRemoveMember } from '@/hooks/queries/useTeamMutations';
import { RemoveMemberDialog } from './RemoveMemberDialog';

interface MemberListProps {
  members: TeamMember[];
  teamId: string;
  canManage: boolean;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function MemberList({ members, teamId, canManage }: MemberListProps) {
  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null);
  const removeMember = useRemoveMember(teamId);

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-secondary-foreground">
        Bu takımda henüz üye yok.
      </div>
    );
  }

  async function handleConfirm() {
    if (!pendingRemove) return;
    await removeMember.mutateAsync(pendingRemove.userId);
    setPendingRemove(null);
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar>
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.fullName} />}
                <AvatarFallback className="text-xs">{initials(m.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{m.fullName}</p>
                <p className="font-mono text-xs text-secondary-foreground">{m.displayId}</p>
              </div>
            </div>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingRemove(m)}
                aria-label={`${m.fullName} kullanıcısını çıkar`}
              >
                Çıkar
              </Button>
            )}
          </li>
        ))}
      </ul>

      <RemoveMemberDialog
        member={pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleConfirm}
        loading={removeMember.isPending}
      />
    </>
  );
}
