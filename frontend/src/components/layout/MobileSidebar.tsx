import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, X } from 'lucide-react';
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
 * Mobile sidebar — drawer for <768px viewports. Mirrors desktop sidebar.
 * shadcn Sheet, TaskFlow token sistemine uyumsuz — bu yüzden raw Radix Dialog
 * kullanılıyor (FRONTEND.md §4.3).
 */
export function MobileSidebar() {
  const open = useUiStore((s) => s.mobileSheetOpen);
  const setOpen = useUiStore((s) => s.setMobileSheetOpen);
  const { user } = useAuth();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const navigate = useNavigate();

  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: activeTeam } = useTeam(activeTeamId ?? undefined);
  const activeTeamName =
    activeTeam?.name ?? teams?.find((t) => t.id === activeTeamId)?.name ?? 'Takım seç';

  function handleSelectTeam(teamId: string) {
    setActiveTeamId(teamId);
    setOpen(false);
    navigate(`/teams/${teamId}`);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 left-0 z-50 h-full w-3/4 max-w-sm border-r border-border bg-card text-foreground shadow-modal',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
            'duration-200 ease-out',
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-lg font-bold text-primary">TaskFlow</span>
              <DialogPrimitive.Close
                aria-label="Menüyü kapat"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <div className="border-b border-border p-4">
              <p className="text-xs uppercase tracking-wide text-secondary-foreground">Şirket</p>
              <p className="truncate text-sm font-semibold text-foreground">TaskFlow Şirketim</p>
              <p className="mt-1 text-xs text-secondary-foreground">
                {user ? roleLabel[user.role] : '—'}
              </p>
            </div>

            <div className="border-b border-border p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-secondary-foreground">
                Takım
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
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

            <div className="flex-1 overflow-y-auto p-4">
              {!activeTeamId ? (
                <p className="text-xs text-secondary-foreground">
                  Üyeleri görmek için bir takım seç.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs uppercase tracking-wide text-secondary-foreground">
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
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
