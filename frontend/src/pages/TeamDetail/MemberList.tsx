import { useState } from 'react';
import type { TeamMember } from '@/services/teams';
import { Button } from '@/components/ui/button';
import { TeamMemberList } from '@/components/teams/TeamMemberList';
import { useRemoveMember } from '@/hooks/queries/useTeamMutations';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import { useUpdateMemberRole } from '@/hooks/queries/useTeamMutations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

interface MemberListProps {
  members: TeamMember[];
  teamId: string;
  canManageMembers: boolean;
  canManageRoles: boolean;
}

export function MemberList({ members, teamId, canManageMembers, canManageRoles }: MemberListProps) {
  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null);
  const removeMember = useRemoveMember(teamId);
  const updateRole = useUpdateMemberRole(teamId);

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-secondary-foreground">
        Bu takımda henüz üye yok.
      </div>
    );
  }

  async function handleConfirm() {
    if (!pendingRemove) return;
    removeMember.reset();
    try {
      await removeMember.mutateAsync(pendingRemove.userId);
      setPendingRemove(null);
    } catch {
      // Dialog renders mutation error and stays open.
    }
  }

  return (
    <>
      <TeamMemberList
        members={members}
        renderAction={(member) =>
          canManageMembers ? (
            <div className="flex items-center gap-1">
              {canManageRoles && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs"
                    >
                      {member.role === 'teamAdmin' ? 'Takım Admini' : 'Üye'}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => updateRole.mutate({ userId: member.userId, role: 'member' })}
                    >
                      Üye
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        updateRole.mutate({ userId: member.userId, role: 'teamAdmin' })
                      }
                    >
                      Takım Admini
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  removeMember.reset();
                  setPendingRemove(member);
                }}
                aria-label={`${member.fullName} kullanıcısını çıkar`}
              >
                Çıkar
              </Button>
            </div>
          ) : null
        }
      />

      <RemoveMemberDialog
        member={pendingRemove}
        onClose={() => {
          removeMember.reset();
          setPendingRemove(null);
        }}
        onConfirm={handleConfirm}
        loading={removeMember.isPending}
        error={
          removeMember.isError ? getApiErrorMessage(removeMember.error, 'Üye çıkarılamadı.') : null
        }
      />
    </>
  );
}
