import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useTeamStore } from '@/stores/teamStore';
import { useTeams, useTeam } from '@/hooks/queries/useTeams';
import { TeamSidebarSection } from './TeamSidebarSection';

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
  const sortedTeams = useMemo(
    () => [...(teams ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [teams],
  );
  const { data: activeTeam } = useTeam(activeTeamId ?? undefined);

  // Eksik veya stale seçimde alfabetik ilk takımı varsayılan yap.
  useEffect(() => {
    if (sortedTeams.length > 0 && !sortedTeams.some((team) => team.id === activeTeamId)) {
      setActiveTeamId(sortedTeams[0].id);
    }
  }, [activeTeamId, setActiveTeamId, sortedTeams]);

  // Stale activeTeamId (eski kullanıcı/logout sonrası) → listede yoksa temizle.
  // Yoksa 403'le patlar, Sidebar her sayfada render olduğu için /dashboard da etkilenir.
  useEffect(() => {
    if (activeTeamId && teams && teams.length === 0) {
      setActiveTeamId(null);
    }
  }, [activeTeamId, teams, setActiveTeamId]);

  const activeTeamName =
    activeTeam?.name ?? sortedTeams.find((t) => t.id === activeTeamId)?.name ?? 'Takım seç';

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
      <TeamSidebarSection
        user={user}
        teams={sortedTeams}
        teamsLoading={teamsLoading}
        activeTeam={activeTeam}
        activeTeamId={activeTeamId}
        activeTeamName={activeTeamName}
        onSelectTeam={handleSelectTeam}
        mobile={false}
        teamSectionClassName="border-b border-border p-3"
        membersSectionClassName="p-3"
      />

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
