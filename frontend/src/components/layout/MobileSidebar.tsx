import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { NavLink, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useTeamStore } from '@/stores/teamStore';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { PRIMARY_NAV, canSeeNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { TeamSidebarSection } from './TeamSidebarSection';

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
  // Stale activeTeamId (eski kullanıcı/logout sonrası) → listede yoksa temizle.
  useEffect(() => {
    if (activeTeamId && teams && !teams.some((t) => t.id === activeTeamId)) {
      setActiveTeamId(null);
    }
  }, [activeTeamId, teams, setActiveTeamId]);
  const activeTeamName =
    activeTeam?.name ?? teams?.find((t) => t.id === activeTeamId)?.name ?? 'Takım seç';

  const visibleNav = PRIMARY_NAV.filter((item) => canSeeNavItem(item, user?.role));

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

            <nav aria-label="Birincil gezinme" className="border-b border-border p-2">
              {visibleNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-secondary font-semibold text-primary'
                        : 'text-foreground hover:bg-secondary',
                    )
                  }
                >
                  <item.Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <TeamSidebarSection
              user={user}
              teams={teams ?? []}
              teamsLoading={teamsLoading}
              activeTeam={activeTeam}
              activeTeamId={activeTeamId}
              activeTeamName={activeTeamName}
              onSelectTeam={handleSelectTeam}
              mobile
              teamSectionClassName="border-b border-border p-4"
              membersSectionClassName="p-4"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
