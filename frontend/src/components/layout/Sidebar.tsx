import { useNavigate } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useTeamStore } from '@/stores/teamStore';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { cn } from '@/lib/utils';

const roleLabel: Record<'companyAdmin' | 'teamAdmin' | 'member', string> = {
  companyAdmin: 'Şirket Admini',
  teamAdmin: 'Takım Admini',
  member: 'Üye',
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Sidebar (PROJECT.md §5.1, FRONTEND.md §2, §6):
 * - Tight density: 260px wide, compact list rows (36-40px)
 * - Hidden <768px; on mobile the MobileSidebar sheet replicates this content
 * - Collapse to 64px (icon-only) via the footer button
 * - Signature: 3-4px amber left border on active team row
 */
export function Sidebar() {
  const { user } = useAuth();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const navigate = useNavigate();

  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: activeTeam } = useTeam(activeTeamId ?? undefined);

  const activeTeamName =
    activeTeam?.name ?? teams?.find((t) => t.id === activeTeamId)?.name ?? 'Takım seç';

  function handleSelectTeam(teamId: string) {
    setActiveTeamId(teamId);
    navigate(`/teams/${teamId}`);
  }

  if (collapsed) {
    return (
      <aside
        className="hidden w-16 shrink-0 flex-col border-r border-border bg-card md:flex"
        aria-label="Yan menü (daraltılmış)"
      >
        <div className="flex flex-1 flex-col items-center justify-between py-4">
          <div className="text-xs font-semibold text-primary">TF</div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
            aria-label="Kenar çubuğunu genişlet"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out md:flex"
      aria-label="Yan menü"
    >
      {/* Tenant header */}
      <div className="border-b border-border p-4">
        <p className="text-xs uppercase tracking-wide text-secondary-foreground">Şirket</p>
        <p className="truncate text-sm font-semibold text-foreground">TaskFlow Şirketim</p>
        <p className="mt-1 text-xs text-secondary-foreground">
          {user ? roleLabel[user.role] : '—'}
        </p>
      </div>

      {/* Team selector */}
      <div className="border-b border-border p-3">
        <p className="mb-1 px-1 text-xs uppercase tracking-wide text-secondary-foreground">Takım</p>
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
            ) : teams && teams.length > 0 ? (
              teams.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => handleSelectTeam(t.id)}
                  className={cn(t.id === activeTeamId && 'bg-secondary')}
                >
                  {t.name}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-1 text-xs text-secondary-foreground">Takım yok</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Member list — sadece aktif takım seçili ise */}
      <div className="flex-1 overflow-y-auto p-3">
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
              <ul className="space-y-1" role="list">
                {activeTeam.members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary"
                  >
                    <Avatar className="h-7 w-7">
                      {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.fullName} />}
                      <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">
                        {initials(m.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{m.fullName}</p>
                      <p className="font-mono text-[11px] text-secondary-foreground">
                        {m.displayId}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Footer: collapse */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary"
          aria-label="Kenar çubuğunu daralt"
        >
          <PanelLeftClose className="h-4 w-4" />
          Kenar çubuğunu daralt
        </button>
      </div>
    </aside>
  );
}
