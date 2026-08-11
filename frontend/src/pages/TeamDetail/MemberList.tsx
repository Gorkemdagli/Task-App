import { useState } from 'react';
import type { TeamMember } from '@/services/teams';
import { Button } from '@/components/ui/button';
import { TeamMemberList } from '@/components/teams/TeamMemberList';
import { useRemoveMember } from '@/hooks/queries/useTeamMutations';
import { RemoveMemberDialog } from './RemoveMemberDialog';

interface MemberListProps {
  members: TeamMember[];
  teamId: string;
  canManage: boolean;
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
      <TeamMemberList
        members={members}
        renderAction={(member) =>
          canManage ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingRemove(member)}
              aria-label={`${member.fullName} kullanıcısını çıkar`}
            >
              Çıkar
            </Button>
          ) : null
        }
      />

      <RemoveMemberDialog
        member={pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleConfirm}
        loading={removeMember.isPending}
      />
    </>
  );
}
