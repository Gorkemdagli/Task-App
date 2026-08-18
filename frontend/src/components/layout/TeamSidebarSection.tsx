import type { AuthUser } from '@/stores/authStore';
import type { Team, TeamDetail } from '@/services/teams';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown } from 'lucide-react';
import { TeamMemberList } from '@/components/teams/TeamMemberList';
import { cn } from '@/lib/utils';
import { MAX_RENDERED_RECORDS } from '@/lib/listLimits';

const roleLabel: Record<AuthUser['role'], string> = {
  companyAdmin: 'Şirket Admini',
  member: 'Üye',
};

interface TeamSidebarSectionProps {
  user: AuthUser | null;
  teams: Team[];
  teamsLoading: boolean;
  activeTeam: TeamDetail | undefined;
  activeTeamId: string | null;
  activeTeamName: string;
  onSelectTeam: (teamId: string) => void;
  mobile: boolean;
  teamSectionClassName: string;
  membersSectionClassName: string;
}

export function TeamSidebarSection({
  user,
  teams,
  teamsLoading,
  activeTeam,
  activeTeamId,
  activeTeamName,
  onSelectTeam,
  mobile,
  teamSectionClassName,
  membersSectionClassName,
}: TeamSidebarSectionProps) {
  return (
    <>
      <div className="border-b border-border p-4">
        <p className="text-xs uppercase tracking-wide text-secondary-foreground">Şirket</p>
        <p className="truncate text-sm font-semibold text-foreground">
          {user?.tenantName ?? 'TaskFlow Şirketim'}
        </p>
        <p className="mt-1 text-xs text-secondary-foreground">
          {user ? roleLabel[user.role] : '—'}
        </p>
      </div>

      <div className={teamSectionClassName}>
        <p
          className={cn(
            'px-1 text-xs uppercase tracking-wide text-secondary-foreground',
            mobile ? 'mb-2' : 'mb-1',
          )}
        >
          Takım
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              aria-label="Aktif takımı değiştir"
            >
              <span className="truncate">{activeTeamName}</span>
              <ChevronDown className="h-4 w-4 text-secondary-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            {teamsLoading ? (
              <div className="px-2 py-1 text-xs text-secondary-foreground">Yükleniyor…</div>
            ) : teams.length > 0 ? (
              teams.slice(0, MAX_RENDERED_RECORDS).map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onSelect={() => onSelectTeam(team.id)}
                  className={cn(team.id === activeTeamId && 'bg-secondary')}
                >
                  {team.name}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-1 text-xs text-secondary-foreground">Takım yok</div>
            )}
            {teams.length > MAX_RENDERED_RECORDS && (
              <p className="px-2 py-1 text-xs text-muted-foreground">İlk 100 kayıt gösteriliyor.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={cn('flex-1 overflow-y-auto', membersSectionClassName)}>
        {!activeTeamId ? (
          <p className="px-1 text-xs text-secondary-foreground">
            Üyeleri görmek için bir takım seç.
          </p>
        ) : (
          <>
            <p className="mb-2 px-1 text-xs uppercase tracking-wide text-secondary-foreground">
              Takım Üyeleri ({activeTeam?.members.length ?? 0})
            </p>
            {!activeTeam ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ) : (
              <TeamMemberList members={activeTeam.members} compact />
            )}
          </>
        )}
      </div>
    </>
  );
}
